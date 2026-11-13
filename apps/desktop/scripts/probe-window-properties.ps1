param([long]$WindowHandle)
$ErrorActionPreference = "Stop"
Add-Type @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct IconPropertyKey {
    public Guid fmtid;
    public uint pid;
}
[StructLayout(LayoutKind.Explicit, Size=24)] public struct IconPropertyValue {
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr text;
}
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IconPropertyStore {
    void GetCount(out uint count);
    void GetAt(uint index, out IconPropertyKey key);
    void GetValue(ref IconPropertyKey key, out IconPropertyValue value);
    void SetValue(ref IconPropertyKey key, ref IconPropertyValue value);
    void Commit();
}
public class IconWindowProperties {
    [DllImport("shell32.dll", PreserveSig=false)]
    static extern void SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, out IconPropertyStore store);
    [DllImport("ole32.dll")]
    static extern int PropVariantClear(ref IconPropertyValue value);
    public static string Read(long hwnd, uint id) {
        Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
        IconPropertyStore store;
        SHGetPropertyStoreForWindow(new IntPtr(hwnd), ref iid, out store);
        try {
            IconPropertyKey key = new IconPropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = id };
            IconPropertyValue value;
            store.GetValue(ref key, out value);
            try { return value.vt == 31 ? Marshal.PtrToStringUni(value.text) : null; }
            finally { PropVariantClear(ref value); }
        } finally { Marshal.ReleaseComObject(store); }
    }
}
'@
@{
    appId = [IconWindowProperties]::Read($WindowHandle, 5)
    icon = [IconWindowProperties]::Read($WindowHandle, 3)
} | ConvertTo-Json -Compress
