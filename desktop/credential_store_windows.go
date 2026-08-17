//go:build windows

package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

type windowsCredentialStore struct{}

const (
	credTypeGeneric         = 1
	credPersistLocalMachine = 2
	winErrorNotFound        = 1168
)

var (
	advapi32    = windows.NewLazySystemDLL("advapi32.dll")
	credReadW   = advapi32.NewProc("CredReadW")
	credWriteW  = advapi32.NewProc("CredWriteW")
	credDeleteW = advapi32.NewProc("CredDeleteW")
	credFree    = advapi32.NewProc("CredFree")
)

type nativeCredential struct {
	Flags              uint32
	Type               uint32
	TargetName         *uint16
	Comment            *uint16
	LastWritten        windows.Filetime
	CredentialBlobSize uint32
	CredentialBlob     *byte
	Persist            uint32
	AttributeCount     uint32
	Attributes         uintptr
	TargetAlias        *uint16
	UserName           *uint16
}

func newCredentialStore() credentialStore {
	return windowsCredentialStore{}
}

func (windowsCredentialStore) Read(ctx context.Context, target string) (string, bool, error) {
	if err := ctx.Err(); err != nil {
		return "", false, err
	}
	targetPtr, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return "", false, err
	}
	var credential *nativeCredential
	if err := callCredential(credReadW, uintptr(unsafe.Pointer(targetPtr)), credTypeGeneric, 0, uintptr(unsafe.Pointer(&credential))); err != nil {
		if errorsIsCredentialNotFound(err) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("读取系统凭据失败: %w", err)
	}
	defer callCredential(credFree, uintptr(unsafe.Pointer(credential)))
	if credential == nil || credential.CredentialBlobSize == 0 || credential.CredentialBlob == nil {
		return "", false, nil
	}
	bytes := unsafe.Slice((*byte)(credential.CredentialBlob), credential.CredentialBlobSize)
	return string(bytes), true, nil
}

func (windowsCredentialStore) Write(ctx context.Context, target string, secret string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return windowsCredentialStore{}.Delete(ctx, target)
	}
	targetPtr, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	commentPtr, _ := windows.UTF16PtrFromString("SurveyController AI provider credential")
	credential := nativeCredential{
		Type:               credTypeGeneric,
		TargetName:         targetPtr,
		Comment:            commentPtr,
		CredentialBlob:     (*byte)(unsafe.Pointer(unsafe.StringData(secret))),
		CredentialBlobSize: uint32(len(secret)),
		Persist:            credPersistLocalMachine,
		UserName:           targetPtr,
	}
	if err := callCredential(credWriteW, uintptr(unsafe.Pointer(&credential)), 0); err != nil {
		return fmt.Errorf("写入系统凭据失败: %w", err)
	}
	return nil
}

func (windowsCredentialStore) Delete(ctx context.Context, target string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	targetPtr, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	if err := callCredential(credDeleteW, uintptr(unsafe.Pointer(targetPtr)), credTypeGeneric, 0); err != nil && !errorsIsCredentialNotFound(err) {
		return fmt.Errorf("删除系统凭据失败: %w", err)
	}
	return nil
}

func errorsIsCredentialNotFound(err error) bool {
	return errors.Is(err, windows.Errno(winErrorNotFound))
}

func callCredential(proc *windows.LazyProc, args ...uintptr) error {
	if err := proc.Find(); err != nil {
		return err
	}
	ret, _, callErr := proc.Call(args...)
	if ret == 0 {
		if callErr != windows.ERROR_SUCCESS {
			return callErr
		}
		return windows.Errno(1)
	}
	return nil
}
