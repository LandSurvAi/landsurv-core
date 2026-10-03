using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace LandsurvConnector.Sync
{
    /// <summary>
    /// Reflection-based Civil 3D CogoPoint access with automatic DBPoint fallback.
    ///
    /// Why reflection: the connector DLL is built against base AutoCAD managed
    /// assemblies (AcMgd/AcDbMgd/AcCoreMgd) so it compiles without a Civil 3D
    /// install, and so plain AutoCAD can still load it. When the host process IS
    /// Civil 3D, AeccDbMgd is present in the process and we use real CogoPoints
    /// (true point numbers, description keys, point groups). Otherwise we fall
    /// back to DBPoint + XData (LANDSURV_PNUM / LANDSURV_DESC).
    ///
    /// Member names used (Civil 3D .NET API):
    ///   Autodesk.Civil.ApplicationServices.CivilDocument.GetCivilDocument(Database)
    ///   CivilDocument.CogoPoints → CogoPointCollection (IEnumerable of ObjectId)
    ///   CogoPointCollection.Add(Point3d) / Add(Point3d, string rawDescription)
    ///   CogoPoint: PointNumber (uint), Easting, Northing, Elevation,
    ///              RawDescription, Location (Point3d), Layer (string)
    ///
    /// VERIFY ON CIVIL 3D WORKSTATION: member names are resolved reflectively and
    /// fail soft (logged + DBPoint fallback) if a Civil 3D version renames them.
    /// </summary>
    internal static class CogoPointAdapter
    {
        private const string CogoPointTypeName = "Autodesk.Civil.DatabaseServices.CogoPoint";
        private const string CivilDocumentTypeName = "Autodesk.Civil.ApplicationServices.CivilDocument";

        private static bool _probed;
        private static bool _available;
        private static Type _cogoPointType;
        private static Type _civilDocumentType;
        private static MethodInfo _getCivilDocument;
        private static int _operationFailureCount;
        private static bool _operationsDisabled;
        private const int CogoPointFailureThreshold = 3;

        /// <summary>
        /// False after repeated Civil 3D API failures in this connector session.
        /// The caller should use the DBPoint/XData implementation instead of
        /// repeatedly invoking an incompatible CogoPoint API.
        /// </summary>
        public static bool CanUseCogoPoints
        {
            get { return IsCivil3DAvailable && !_operationsDisabled; }
        }

        /// <summary>True when the host process has the Civil 3D managed API loaded.</summary>
        public static bool IsCivil3DAvailable
        {
            get
            {
                if (!_probed) Probe();
                return _available;
            }
        }

        private static void Probe()
        {
            _probed = true;
            _available = false;
            try
            {
                Assembly aeccDbMgd = null;
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    string name = asm.GetName().Name;
                    if (string.Equals(name, "AeccDbMgd", StringComparison.OrdinalIgnoreCase))
                    {
                        aeccDbMgd = asm;
                        break;
                    }
                }
                if (aeccDbMgd == null)
                {
                    // Civil 3D's install dir is on the host process probing path when
                    // running inside Civil 3D, so Assembly.Load resolves there.
                    try { aeccDbMgd = Assembly.Load(new AssemblyName("AeccDbMgd")); }
                    catch { return; /* plain AutoCAD — fallback */ }
                }

                _cogoPointType = aeccDbMgd.GetType(CogoPointTypeName);
                _civilDocumentType = aeccDbMgd.GetType(CivilDocumentTypeName);
                if (_cogoPointType == null || _civilDocumentType == null) return;

                _getCivilDocument = _civilDocumentType.GetMethod(
                    "GetCivilDocument", BindingFlags.Public | BindingFlags.Static,
                    null, new[] { typeof(Database) }, null);
                if (_getCivilDocument == null) return;

                _available = true;
            }
            catch
            {
                _available = false;
            }
        }

        private static object GetCogoPointCollection(Database db)
        {
            if (!IsCivil3DAvailable) return null;
            object civilDoc = _getCivilDocument.Invoke(null, new object[] { db });
            return civilDoc?.GetType().GetProperty("CogoPoints")?.GetValue(civilDoc);
        }

        /// <summary>Enumerate all CogoPoints as sync records. Returns null when Civil 3D
        /// API is unavailable (caller should fall back to DBPoint scan).</summary>
        public static List<SyncPointRecord> TryReadAll(Database db, Transaction tr, Action<string> log)
        {
            if (!CanUseCogoPoints) return null;
            try
            {
                var results = new List<SyncPointRecord>();
                object collection = GetCogoPointCollection(db);
                if (collection == null) return null;

                foreach (object objIdObj in (IEnumerable)collection)
                {
                    if (!(objIdObj is ObjectId)) continue;
                    object cogo = tr.GetObject((ObjectId)objIdObj, OpenMode.ForRead);
                    results.Add(new SyncPointRecord
                    {
                        PointNumber = GetProp<uint>(cogo, "PointNumber").ToString(),
                        Easting = GetProp<double>(cogo, "Easting"),
                        Northing = GetProp<double>(cogo, "Northing"),
                        Elevation = GetProp<double>(cogo, "Elevation"),
                        Description = GetProp<string>(cogo, "RawDescription") ?? "",
                        Layer = GetProp<string>(cogo, "Layer"),
                    });
                }
                return results;
            }
            catch (Exception ex)
            {
                RecordOperationFailure(log, "CogoPoint read failed; using DBPoint scan", ex);
                return null;
            }
        }

        /// <summary>Map point number → ObjectId for updates/deletes. Null when unavailable.</summary>
        public static Dictionary<string, ObjectId> TryGetPointNumberMap(Database db, Transaction tr, Action<string> log)
        {
            if (!CanUseCogoPoints) return null;
            try
            {
                var map = new Dictionary<string, ObjectId>(StringComparer.OrdinalIgnoreCase);
                object collection = GetCogoPointCollection(db);
                if (collection == null) return null;
                foreach (object objIdObj in (IEnumerable)collection)
                {
                    if (!(objIdObj is ObjectId id)) continue;
                    object cogo = tr.GetObject(id, OpenMode.ForRead);
                    string num = GetProp<uint>(cogo, "PointNumber").ToString();
                    if (!map.ContainsKey(num)) map[num] = id;
                }
                return map;
            }
            catch (Exception ex)
            {
                RecordOperationFailure(log, "CogoPoint map failed; using DBPoint fallback", ex);
                return null;
            }
        }

        /// <summary>Create a real CogoPoint. Returns ObjectId.Null on failure.</summary>
        public static ObjectId TryCreate(Database db, Transaction tr, SyncPointRecord point, Action<string> log)
        {
            if (!CanUseCogoPoints) return ObjectId.Null;
            try
            {
                object collection = GetCogoPointCollection(db);
                if (collection == null) return ObjectId.Null;

                var location = new Point3d(point.Easting, point.Northing, point.Elevation);

                // Prefer Add(Point3d, string rawDescription); fall back to Add(Point3d).
                MethodInfo add = FindMethod(collection.GetType(), "Add",
                    new[] { typeof(Point3d), typeof(string) })
                    ?? FindMethod(collection.GetType(), "Add", new[] { typeof(Point3d) });
                if (add == null)
                {
                    RecordOperationFailure(log, "CogoPointCollection.Add overload not found", null);
                    return ObjectId.Null;
                }

                object result = add.GetParameters().Length == 2
                    ? add.Invoke(collection, new object[] { location, point.Description ?? "" })
                    : add.Invoke(collection, new object[] { location });

                if (!(result is ObjectId newId) || newId == ObjectId.Null) return ObjectId.Null;

                // Assign the requested point number + layer.
                object cogo = tr.GetObject(newId, OpenMode.ForWrite);
                SetProp(cogo, "PointNumber", uint.Parse(point.PointNumber));
                if (!string.IsNullOrEmpty(point.Layer)) SetProp(cogo, "Layer", point.Layer);
                return newId;
            }
            catch (Exception ex)
            {
                RecordOperationFailure(log, $"CogoPoint create failed for #{point.PointNumber}", ex);
                return ObjectId.Null;
            }
        }

        /// <summary>Update an existing CogoPoint in place.</summary>
        public static bool TryUpdate(Transaction tr, ObjectId id, SyncPointRecord point, Action<string> log)
        {
            if (!CanUseCogoPoints) return false;
            try
            {
                object cogo = tr.GetObject(id, OpenMode.ForWrite);
                SetProp(cogo, "Easting", point.Easting);
                SetProp(cogo, "Northing", point.Northing);
                SetProp(cogo, "Elevation", point.Elevation);
                if (point.Description != null) SetProp(cogo, "RawDescription", point.Description);
                if (!string.IsNullOrEmpty(point.Layer)) SetProp(cogo, "Layer", point.Layer);
                return true;
            }
            catch (Exception ex)
            {
                RecordOperationFailure(log, $"CogoPoint update failed for #{point.PointNumber}", ex);
                return false;
            }
        }

        /// <summary>Erase a CogoPoint (only called for explicit user-approved deletes).</summary>
        public static bool TryDelete(Transaction tr, ObjectId id, Action<string> log)
        {
            try
            {
                var obj = tr.GetObject(id, OpenMode.ForWrite) as DBObject;
                if (obj == null) return false;
                obj.Erase();
                return true;
            }
            catch (Exception ex)
            {
                log?.Invoke($"CogoPoint delete failed: {ex.Message}");
                return false;
            }
        }

        // ── Reflection plumbing ───────────────────────────────────────────────

        private static MethodInfo FindMethod(Type type, string name, Type[] paramTypes)
        {
            foreach (var m in type.GetMethods(BindingFlags.Public | BindingFlags.Instance))
            {
                if (m.Name != name) continue;
                var ps = m.GetParameters();
                if (ps.Length != paramTypes.Length) continue;
                bool match = true;
                for (int i = 0; i < ps.Length; i++)
                {
                    if (ps[i].ParameterType != paramTypes[i]) { match = false; break; }
                }
                if (match) return m;
            }
            return null;
        }

        private static T GetProp<T>(object obj, string name)
        {
            object value = obj.GetType().GetProperty(name)?.GetValue(obj);
            if (value == null) return default;
            return (T)Convert.ChangeType(value, typeof(T));
        }

        private static void SetProp(object obj, string name, object value)
        {
            var prop = obj.GetType().GetProperty(name);
            if (prop?.CanWrite == true) prop.SetValue(obj, value);
        }

        private static void RecordOperationFailure(Action<string> log, string message, Exception ex)
        {
            if (_operationsDisabled) return;

            _operationFailureCount++;
            if (_operationFailureCount < CogoPointFailureThreshold)
            {
                log?.Invoke($"{message}{(ex == null ? "" : $": {ex.Message}")}");
                return;
            }

            _operationsDisabled = true;
            log?.Invoke(
                "Civil 3D CogoPoint operations disabled for this session after " +
                $"{_operationFailureCount} API failures. Continuing with DBPoint/XData fallback.");
        }
    }
}
