package main

type sleepBlocker interface {
	Acquire() bool
	Release() bool
}

type noopSleepBlocker struct{}

func (noopSleepBlocker) Acquire() bool {
	return false
}

func (noopSleepBlocker) Release() bool {
	return true
}
