//go:build !windows

package main

import "os"

func replaceFile(source string, target string) error {
	return os.Rename(source, target)
}
