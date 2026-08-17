package rpc

import (
	"bytes"
	"encoding/binary"
	"errors"
	"testing"
)

func TestFrameRoundTrip(t *testing.T) {
	want := Request{ID: 7, Method: "LoadConfig", Params: []byte(`{"path":"D:/config.json"}`)}
	var stream bytes.Buffer
	if err := WriteFrame(&stream, want); err != nil {
		t.Fatal(err)
	}
	var got Request
	if err := ReadFrame(&stream, &got); err != nil {
		t.Fatal(err)
	}
	if got.ID != want.ID || got.Method != want.Method || string(got.Params) != string(want.Params) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func TestReadFrameRejectsOversizePayload(t *testing.T) {
	var stream bytes.Buffer
	if err := binary.Write(&stream, binary.LittleEndian, uint32(MaxFrameSize+1)); err != nil {
		t.Fatal(err)
	}
	var request Request
	if err := ReadFrame(&stream, &request); !errors.Is(err, ErrFrameTooLarge) {
		t.Fatalf("error = %v", err)
	}
}
