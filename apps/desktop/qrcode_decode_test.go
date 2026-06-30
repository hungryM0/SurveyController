package main

import (
	"encoding/base64"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/makiuchi-d/gozxing"
	"github.com/makiuchi-d/gozxing/qrcode"
)

func TestDecodeQRCodeImageReadsSurveyURL(t *testing.T) {
	path := filepath.Join(t.TempDir(), "survey-qr.png")
	const want = "https://www.wjx.cn/vm/demo.aspx"
	writeTestQRCode(t, path, want)

	state, err := decodeQRCodeImage(path)
	if err != nil {
		t.Fatal(err)
	}
	if state.Path != path || state.Text != want {
		t.Fatalf("state = %#v", state)
	}
}

func TestDecodeQRCodeDataURLReadsSurveyURL(t *testing.T) {
	path := filepath.Join(t.TempDir(), "survey-qr.png")
	const want = "https://www.wjx.cn/vm/dataurl.aspx"
	writeTestQRCode(t, path, want)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	state, err := decodeQRCodeDataURL("data:image/png;base64,"+base64.StdEncoding.EncodeToString(data), "pasted.png")
	if err != nil {
		t.Fatal(err)
	}
	if state.Path != "pasted.png" || state.Text != want {
		t.Fatalf("state = %#v", state)
	}
}

func TestDecodeQRCodeDataURLRejectsInvalidBase64(t *testing.T) {
	_, err := decodeQRCodeDataURL("data:image/png;base64,not-valid", "")
	if err == nil || !strings.Contains(err.Error(), "base64") {
		t.Fatalf("err = %v", err)
	}
}

func TestDecodeQRCodeImageRejectsBlankPath(t *testing.T) {
	_, err := decodeQRCodeImage(" ")
	if err == nil || !strings.Contains(err.Error(), "图片路径不能为空") {
		t.Fatalf("err = %v", err)
	}
}

func TestAppServiceDecodeQRCode(t *testing.T) {
	path := filepath.Join(t.TempDir(), "survey-qr.png")
	const want = "https://wj.qq.com/s2/123/hash/"
	writeTestQRCode(t, path, want)

	state, err := NewAppService().DecodeQRCode(nil, DecodeQRCodeRequest{Path: path})
	if err != nil {
		t.Fatal(err)
	}
	if state.Text != want {
		t.Fatalf("state = %#v", state)
	}
}

func TestAppServiceDecodeQRCodeDataURL(t *testing.T) {
	path := filepath.Join(t.TempDir(), "survey-qr.png")
	const want = "https://wj.qq.com/s2/999/hash/"
	writeTestQRCode(t, path, want)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	state, err := NewAppService().DecodeQRCode(nil, DecodeQRCodeRequest{
		DataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(data),
		Name:    "drop.png",
	})
	if err != nil {
		t.Fatal(err)
	}
	if state.Path != "drop.png" || state.Text != want {
		t.Fatalf("state = %#v", state)
	}
}

func writeTestQRCode(t *testing.T, path string, text string) {
	t.Helper()
	writer := qrcode.NewQRCodeWriter()
	matrix, err := writer.Encode(text, gozxing.BarcodeFormat_QR_CODE, 256, 256, nil)
	if err != nil {
		t.Fatal(err)
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if err := png.Encode(file, matrix); err != nil {
		t.Fatal(err)
	}
}
