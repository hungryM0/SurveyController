package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"strings"

	"github.com/makiuchi-d/gozxing"
	"github.com/makiuchi-d/gozxing/qrcode"
)

func decodeQRCodeImage(path string) (QRCodeDecodeState, error) {
	cleanPath := strings.TrimSpace(path)
	if cleanPath == "" {
		return QRCodeDecodeState{}, fmt.Errorf("图片路径不能为空")
	}
	file, err := os.Open(cleanPath)
	if err != nil {
		return QRCodeDecodeState{}, err
	}
	defer file.Close()
	if info, err := file.Stat(); err == nil && info.Size() > 32<<20 {
		return QRCodeDecodeState{}, fmt.Errorf("图片文件过大")
	}

	state, err := decodeQRCodeReader(file)
	if err != nil {
		return QRCodeDecodeState{}, err
	}
	state.Path = cleanPath
	return state, nil
}

func decodeQRCodeDataURL(dataURL string, name string) (QRCodeDecodeState, error) {
	payload := strings.TrimSpace(dataURL)
	if payload == "" {
		return QRCodeDecodeState{}, fmt.Errorf("图片数据不能为空")
	}
	if !strings.HasPrefix(strings.ToLower(payload), "data:") {
		return QRCodeDecodeState{}, fmt.Errorf("图片数据不是有效的 data URL")
	}
	header, encoded, ok := strings.Cut(payload, ",")
	if !ok || !strings.Contains(strings.ToLower(header), ";base64") {
		return QRCodeDecodeState{}, fmt.Errorf("图片数据不是有效的 base64 data URL")
	}
	if len(encoded) > 32<<20 {
		return QRCodeDecodeState{}, fmt.Errorf("图片数据过大")
	}
	data, err := decodeBase64(encoded)
	if err != nil {
		return QRCodeDecodeState{}, fmt.Errorf("图片数据不是有效的 base64")
	}
	state, err := decodeQRCodeReader(bytes.NewReader(data))
	if err != nil {
		return QRCodeDecodeState{}, err
	}
	state.Path = strings.TrimSpace(name)
	return state, nil
}

func decodeBase64(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	decoders := []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding}
	for _, decoder := range decoders {
		if data, err := decoder.DecodeString(value); err == nil {
			return data, nil
		}
	}
	return nil, fmt.Errorf("invalid base64")
}

func decodeQRCodeReader(source interface {
	Read([]byte) (int, error)
}) (QRCodeDecodeState, error) {
	img, _, err := image.Decode(source)
	if err != nil {
		return QRCodeDecodeState{}, fmt.Errorf("无法读取二维码图片: %w", err)
	}
	bitmap, err := gozxing.NewBinaryBitmapFromImage(img)
	if err != nil {
		return QRCodeDecodeState{}, fmt.Errorf("无法解析二维码图片: %w", err)
	}
	reader := qrcode.NewQRCodeReader()
	result, err := reader.Decode(bitmap, map[gozxing.DecodeHintType]interface{}{
		gozxing.DecodeHintType_TRY_HARDER: true,
	})
	if err != nil {
		return QRCodeDecodeState{}, fmt.Errorf("未识别到二维码")
	}
	text := strings.TrimSpace(result.GetText())
	if text == "" {
		return QRCodeDecodeState{}, fmt.Errorf("二维码内容为空")
	}
	return QRCodeDecodeState{Text: text}, nil
}
