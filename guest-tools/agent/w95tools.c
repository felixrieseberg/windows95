/*
 * W95TOOLS — guest-side integration agent for the windows95 emulator.
 *
 * Currently: bidirectional text clipboard. Talks to the emulator over the
 * legacy VMware backdoor (port 0x5658; implemented in v86's vmware.js).
 * Joins the Win32 clipboard-viewer chain so guest copies are pushed
 * immediately, and polls the backdoor on a timer so host copies show up
 * within ~250 ms.
 *
 * Win9x runs ring-3 code with the I/O bitmap wide open, so a plain IN works
 * from a user process — no driver needed. On NT this would #GP; we don't run
 * there.
 *
 * Build with Open Watcom v2 (see Makefile). Links USER32/KERNEL32 only,
 * runs on Win95 RTM.
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#define VMW_MAGIC   0x564D5868UL
#define VMW_PORT    0x5658
#define CMD_GETLEN  6
#define CMD_GETDATA 7
#define CMD_SETLEN  8
#define CMD_SETDATA 9
#define CMD_VERSION 10

#define POLL_MS     250
#define MAX_CLIP    0xFFFF

extern unsigned long bd(unsigned long cmd, unsigned long arg);
#pragma aux bd =            \
    "mov eax, 564D5868h"    \
    "mov edx, 5658h"        \
    "in  eax, dx"           \
    parm [ecx] [ebx]        \
    value [eax]             \
    modify [edx];

extern unsigned long bd_ebx(unsigned long cmd, unsigned long arg);
#pragma aux bd_ebx =        \
    "mov eax, 564D5868h"    \
    "mov edx, 5658h"        \
    "in  eax, dx"           \
    parm [ecx] [ebx]        \
    value [ebx]             \
    modify [eax edx];

static HWND g_next;
static int  g_ignore;

static void push_to_host(HWND hwnd)
{
    HANDLE h;
    char *p;
    unsigned long len, i, w;

    if (!IsClipboardFormatAvailable(CF_TEXT)) {
        bd(CMD_SETLEN, 0);
        return;
    }
    if (!OpenClipboard(hwnd)) return;
    h = GetClipboardData(CF_TEXT);
    if (h && (p = (char *)GlobalLock(h)) != 0) {
        len = lstrlen(p);
        if (len > MAX_CLIP) len = MAX_CLIP;
        bd(CMD_SETLEN, len);
        for (i = 0; i < len; i += 4) {
            w  =  (unsigned char)p[i];
            if (i + 1 < len) w |= (unsigned long)(unsigned char)p[i+1] << 8;
            if (i + 2 < len) w |= (unsigned long)(unsigned char)p[i+2] << 16;
            if (i + 3 < len) w |= (unsigned long)(unsigned char)p[i+3] << 24;
            bd(CMD_SETDATA, w);
        }
        GlobalUnlock(h);
    }
    CloseClipboard();
}

static void pull_from_host(HWND hwnd)
{
    long len;
    unsigned long i, w;
    HGLOBAL h;
    char *p;

    len = (long)bd(CMD_GETLEN, 0);
    if (len < 0) return;
    if (len > MAX_CLIP) len = MAX_CLIP;

    h = GlobalAlloc(GMEM_MOVEABLE | GMEM_DDESHARE, (DWORD)len + 1);
    if (!h) return;
    p = (char *)GlobalLock(h);
    for (i = 0; i < (unsigned long)len; i += 4) {
        w = bd(CMD_GETDATA, 0);
        p[i] = (char)w;
        if (i + 1 < (unsigned long)len) p[i+1] = (char)(w >> 8);
        if (i + 2 < (unsigned long)len) p[i+2] = (char)(w >> 16);
        if (i + 3 < (unsigned long)len) p[i+3] = (char)(w >> 24);
    }
    p[len] = 0;
    GlobalUnlock(h);

    if (!OpenClipboard(hwnd)) { GlobalFree(h); return; }
    g_ignore++;
    EmptyClipboard();
    SetClipboardData(CF_TEXT, h);
    CloseClipboard();
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
    case WM_CREATE:
        g_next = SetClipboardViewer(hwnd);
        SetTimer(hwnd, 1, POLL_MS, 0);
        return 0;

    case WM_DRAWCLIPBOARD:
        if (g_ignore > 0) g_ignore--;
        else push_to_host(hwnd);
        if (g_next) SendMessage(g_next, msg, wp, lp);
        return 0;

    case WM_CHANGECBCHAIN:
        if ((HWND)wp == g_next) g_next = (HWND)lp;
        else if (g_next) SendMessage(g_next, msg, wp, lp);
        return 0;

    case WM_TIMER:
        pull_from_host(hwnd);
        return 0;

    case WM_DESTROY:
        ChangeClipboardChain(hwnd, g_next);
        KillTimer(hwnd, 1);
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProc(hwnd, msg, wp, lp);
}

int PASCAL WinMain(HINSTANCE hi, HINSTANCE hp, LPSTR cmd, int show)
{
    WNDCLASS wc;
    HWND hwnd;
    MSG msg;

    (void)hp; (void)cmd; (void)show;

    if (CreateMutex(0, FALSE, "W95Tools") && GetLastError() == ERROR_ALREADY_EXISTS)
        return 0;

    if (bd_ebx(CMD_VERSION, 0) != VMW_MAGIC) {
        MessageBox(0, "VMware backdoor not present.", "W95Tools", MB_OK | MB_ICONSTOP);
        return 1;
    }

    wc.style         = 0;
    wc.lpfnWndProc   = WndProc;
    wc.cbClsExtra    = 0;
    wc.cbWndExtra    = 0;
    wc.hInstance     = hi;
    wc.hIcon         = 0;
    wc.hCursor       = 0;
    wc.hbrBackground = 0;
    wc.lpszMenuName  = 0;
    wc.lpszClassName = "W95Tools";
    RegisterClass(&wc);

    hwnd = CreateWindow("W95Tools", "W95Tools", WS_OVERLAPPED,
                        0, 0, 0, 0, 0, 0, hi, 0);
    if (!hwnd) return 1;

    while (GetMessage(&msg, 0, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
    return 0;
}
