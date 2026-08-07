package rpc

import "encoding/json"

const MaxFrameSize = 16 << 20

type Request struct {
	ID     uint64          `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params,omitempty"`
}

type Response struct {
	ID     uint64          `json:"id"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *Error          `json:"error,omitempty"`
}

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string {
	return e.Message
}

func InvalidParams(err error) *Error {
	return &Error{Code: "invalid_params", Message: err.Error()}
}

func MethodNotFound(method string) *Error {
	return &Error{Code: "method_not_found", Message: "未知 RPC 方法：" + method}
}
