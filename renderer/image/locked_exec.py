"""Linux child bootstrap. Deny IP networking before exec; inherited stdout/err are discarded."""
import ctypes
import ctypes.util
import errno
import os
import socket
import sys

class Comparison(ctypes.Structure):
    _fields_=[('arg',ctypes.c_uint),('op',ctypes.c_uint),('a',ctypes.c_uint64),('b',ctypes.c_uint64)]

def lock_network():
    lib=ctypes.CDLL(ctypes.util.find_library('seccomp') or 'libseccomp.so.2')
    lib.seccomp_init.argtypes=[ctypes.c_uint32];lib.seccomp_init.restype=ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p];lib.seccomp_syscall_resolve_name.restype=ctypes.c_int
    lib.seccomp_rule_add_array.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint,ctypes.POINTER(Comparison)]
    lib.seccomp_load.argtypes=[ctypes.c_void_p];lib.seccomp_release.argtypes=[ctypes.c_void_p]
    ctx=lib.seccomp_init(0x7FFF0000)
    if not ctx:raise RuntimeError('Cannot create renderer syscall policy.')
    try:
        for name in ['socket','socketpair','io_uring_setup','ptrace','process_vm_readv','process_vm_writev','bpf']:
            nr=lib.seccomp_syscall_resolve_name(name.encode())
            if nr<0:continue
            # SCMP_CMP_NE: Unix domain sockets needed by LibreOffice remain usable.
            cmp=Comparison(0,1,socket.AF_UNIX,0) if name in {'socket','socketpair'} else None
            if lib.seccomp_rule_add_array(ctx,0x00050000|errno.EPERM,nr,int(cmp is not None),ctypes.byref(cmp) if cmp is not None else None)!=0:raise RuntimeError('Cannot install renderer rule.')
        if lib.seccomp_load(ctx)!=0:raise RuntimeError('Cannot activate renderer syscall policy.')
    finally:lib.seccomp_release(ctx)

if __name__=='__main__':
    if len(sys.argv)<2 or sys.argv[1] not in {'/usr/bin/soffice','/usr/bin/pdftoppm'}:raise SystemExit(2)
    lock_network()
    os.execv(sys.argv[1],sys.argv[1:])
