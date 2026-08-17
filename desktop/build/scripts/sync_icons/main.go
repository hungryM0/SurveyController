package main

import (
	"flag"
	"io"
	"log"
	"os"
	"path/filepath"
)

func main() {
	root := flag.String("root", "..", "desktop application root")
	flag.Parse()

	desktopRoot, err := filepath.Abs(*root)
	if err != nil {
		log.Fatal(err)
	}
	repoRoot := filepath.Clean(filepath.Join(desktopRoot, ".."))
	assetsDir := filepath.Join(repoRoot, "assets")
	buildDir := filepath.Join(desktopRoot, "build")

	sourcePNG := filepath.Join(assetsDir, "icon.png")
	sourceICO := filepath.Join(assetsDir, "icon.ico")

	must(copyFile(sourcePNG, filepath.Join(buildDir, "appicon.png")))
	must(copyFile(sourceICO, filepath.Join(buildDir, "windows", "icon.ico")))

}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

func copyFile(source, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}

	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer output.Close()

	_, err = io.Copy(output, input)
	return err
}
