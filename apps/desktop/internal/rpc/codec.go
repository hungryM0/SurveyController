package rpc

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

var ErrFrameTooLarge = errors.New("RPC 帧超过大小限制")

func ReadFrame(reader io.Reader, target any) error {
	var size uint32
	if err := binary.Read(reader, binary.LittleEndian, &size); err != nil {
		return err
	}
	if size == 0 {
		return fmt.Errorf("RPC 帧不能为空")
	}
	if size > MaxFrameSize {
		return fmt.Errorf("%w: %d", ErrFrameTooLarge, size)
	}
	payload := make([]byte, size)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return err
	}
	if err := json.Unmarshal(payload, target); err != nil {
		return fmt.Errorf("解析 RPC JSON: %w", err)
	}
	return nil
}

func WriteFrame(writer io.Writer, value any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("编码 RPC JSON: %w", err)
	}
	if len(payload) > MaxFrameSize {
		return fmt.Errorf("%w: %d", ErrFrameTooLarge, len(payload))
	}
	if err := binary.Write(writer, binary.LittleEndian, uint32(len(payload))); err != nil {
		return err
	}
	if _, err := writer.Write(payload); err != nil {
		return err
	}
	return nil
}
