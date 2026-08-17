package rpc

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"
)

type testHandler struct{}

func (testHandler) Handle(_ context.Context, method string, _ json.RawMessage) (any, error) {
	if method == "Ping" {
		return map[string]bool{"ready": true}, nil
	}
	return nil, MethodNotFound(method)
}

func TestServerWritesSuccessAndMethodErrors(t *testing.T) {
	var input bytes.Buffer
	if err := WriteFrame(&input, Request{ID: 1, Method: "Ping"}); err != nil {
		t.Fatal(err)
	}
	if err := WriteFrame(&input, Request{ID: 2, Method: "Missing"}); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := NewServer(&input, &output, testHandler{}).Serve(); err != nil {
		t.Fatal(err)
	}
	var success Response
	if err := ReadFrame(&output, &success); err != nil {
		t.Fatal(err)
	}
	if success.ID != 1 || success.Error != nil || string(success.Result) != `{"ready":true}` {
		t.Fatalf("success = %#v", success)
	}
	var failure Response
	if err := ReadFrame(&output, &failure); err != nil {
		t.Fatal(err)
	}
	if failure.ID != 2 || failure.Error == nil || failure.Error.Code != "method_not_found" {
		t.Fatalf("failure = %#v", failure)
	}
}
