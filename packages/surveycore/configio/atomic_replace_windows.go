//go:build windows

package configio

import (
	"fmt"
	"syscall"
	"unsafe"
)

const (
	moveFileReplaceExisting = 0x1
	moveFileWriteThrough    = 0x8
)

var moveFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW")

func atomicReplace(source string, target string) error {
	sourcePtr, err := syscall.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	targetPtr, err := syscall.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	ret, _, callErr := moveFileEx.Call(
		uintptr(unsafe.Pointer(sourcePtr)),
		uintptr(unsafe.Pointer(targetPtr)),
		moveFileReplaceExisting|moveFileWriteThrough,
	)
	if ret == 0 {
		return fmt.Errorf("Windows 原子替换失败: %w", callErr)
	}
	return nil
}
