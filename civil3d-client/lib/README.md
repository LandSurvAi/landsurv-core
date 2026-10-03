# AutoCAD managed reference assemblies (compile-only)

Drop these three DLLs here to build the connector without installing AutoCAD/Civil 3D:

- `acmgd.dll`
- `acdbmgd.dll`
- `accoremgd.dll`

## Where to get them

From any machine with Civil 3D (or AutoCAD) 2026 installed:

```
C:\Program Files\Autodesk\AutoCAD 2026\acmgd.dll
C:\Program Files\Autodesk\AutoCAD 2026\acdbmgd.dll
C:\Program Files\Autodesk\AutoCAD 2026\accoremgd.dll
```

Copy them into this folder. The build (`civil3d-client\build.ps1`) prefers an
installed AutoCAD at `C:\Program Files\Autodesk\AutoCAD 2026\` and falls back to
these files when no install is present.

## Important

- These are **compile-time references only** (`Private=False` in the .csproj) —
  they are NOT copied into the output or shipped in the MSI. At runtime the plugin
  loads the host AutoCAD/Civil 3D process's own copies.
- **Do not commit these DLLs.** They are proprietary Autodesk assemblies and large.
  The `.gitignore` in this folder excludes `*.dll`.
- No Civil 3D-specific reference assemblies are required — CogoPoint support is
  reflection-based (`Sync/CogoPointAdapter.cs`), so the plugin compiles against
  base AutoCAD and still loads in plain AutoCAD (with a DBPoint fallback).
