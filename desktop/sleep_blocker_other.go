//go:build !windows

package main

func newSystemSleepBlocker() sleepBlocker {
	return noopSleepBlocker{}
}
