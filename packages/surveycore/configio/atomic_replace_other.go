//go:build !windows

package configio

import "os"

func atomicReplace(source string, target string) error {
	return os.Rename(source, target)
}
