using System.Reflection;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.Runtime;
using LandsurvConnector;

// Registers ConnectorExtension.Initialize() to run the moment this assembly is
// loaded into Civil 3D (via NETLOAD or a bundle). Only ONE ExtensionApplication
// is allowed per assembly.
[assembly: ExtensionApplication(typeof(ConnectorExtension))]

namespace LandsurvConnector
{
    /// <summary>
    /// Prints a load banner with the REAL assembly version the instant the DLL is
    /// loaded. This makes a stale load obvious: a genuine NETLOAD prints the new
    /// version, while an ignored NETLOAD (the same assembly name is already loaded
    /// in the session — .NET can't hot-swap it) prints nothing, so the user knows
    /// they must fully restart Civil 3D before the new build takes effect.
    ///
    /// The version is read from the loaded assembly's FileVersion at runtime, so it
    /// can never disagree with the actual bits on disk (no hardcoded string here).
    /// </summary>
    public sealed class ConnectorExtension : IExtensionApplication
    {
        public void Initialize()
        {
            try
            {
                var asm = Assembly.GetExecutingAssembly();
                string ver;
                try
                {
                    ver = System.Diagnostics.FileVersionInfo
                        .GetVersionInfo(asm.Location).FileVersion;
                }
                catch
                {
                    ver = asm.GetName().Version?.ToString() ?? "unknown";
                }

                var doc = Application.DocumentManager?.MdiActiveDocument;
                doc?.Editor.WriteMessage(
                    $"\n✓ LandSurv.ai Connector v{ver} loaded. Type LANDSURVAI to connect.\n");
            }
            catch
            {
                // Never let a banner failure block the plugin from loading.
            }
        }

        public void Terminate()
        {
        }
    }
}
