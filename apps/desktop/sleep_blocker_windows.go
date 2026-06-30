//go:build windows

package main

import (
	"syscall"
)

const (
	executionStateSystemRequired = 0x00000001
	executionStateContinuous     = 0x80000000
)

type systemSleepBlocker struct {
	active bool
}

func newSystemSleepBlocker() sleepBlocker {
	return &systemSleepBlocker{}
}

func (b *systemSleepBlocker) Acquire() bool {
	if b.active {
		return true
	}
	if setThreadExecutionState(executionStateContinuous|executionStateSystemRequired) == 0 {
		return false
	}
	b.active = true
	return true
}

func (b *systemSleepBlocker) Release() bool {
	if !b.active {
		return true
	}
	if setThreadExecutionState(executionStateContinuous) == 0 {
		return false
	}
	b.active = false
	return true
}

func setThreadExecutionState(flags uintptr) uintptr {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	proc := kernel32.NewProc("SetThreadExecutionState")
	result, _, _ := proc.Call(flags)
	return result
}
