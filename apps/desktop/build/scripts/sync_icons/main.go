package main

import (
	"flag"
	"image"
	"image/png"
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
	repoRoot := filepath.Clean(filepath.Join(desktopRoot, "..", ".."))
	assetsDir := filepath.Join(repoRoot, "assets")
	buildDir := filepath.Join(desktopRoot, "build")

	sourcePNG := filepath.Join(assetsDir, "icon.png")
	sourceICO := filepath.Join(assetsDir, "icon.ico")

	must(copyFile(sourcePNG, filepath.Join(buildDir, "appicon.png")))
	must(copyFile(sourceICO, filepath.Join(buildDir, "windows", "icon.ico")))
	must(copyFile(sourcePNG, filepath.Join(desktopRoot, "frontend", "public", "appicon.png")))

	source, err := loadPNG(sourcePNG)
	must(err)

	msixAssets := filepath.Join(buildDir, "windows", "msix", "Assets")
	must(saveResizedPNG(source, 50, 50, filepath.Join(msixAssets, "StoreLogo.png")))
	must(saveResizedPNG(source, 44, 44, filepath.Join(msixAssets, "Square44x44Logo.png")))
	must(saveResizedPNG(source, 150, 150, filepath.Join(msixAssets, "Square150x150Logo.png")))
	must(saveResizedPNG(source, 310, 150, filepath.Join(msixAssets, "Wide310x150Logo.png")))
	must(saveResizedPNG(source, 620, 300, filepath.Join(msixAssets, "SplashScreen.png")))
	must(saveResizedPNG(source, 256, 256, filepath.Join(msixAssets, "AppIcon.png")))
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

func loadPNG(path string) (image.Image, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	return png.Decode(file)
}

func saveResizedPNG(source image.Image, width, height int, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}

	target := image.NewRGBA(image.Rect(0, 0, width, height))
	bounds := source.Bounds()
	sourceWidth := bounds.Dx()
	sourceHeight := bounds.Dy()
	for y := 0; y < height; y++ {
		sourceY := bounds.Min.Y + y*sourceHeight/height
		for x := 0; x < width; x++ {
			sourceX := bounds.Min.X + x*sourceWidth/width
			target.Set(x, y, source.At(sourceX, sourceY))
		}
	}

	file, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer file.Close()

	return png.Encode(file, target)
}
