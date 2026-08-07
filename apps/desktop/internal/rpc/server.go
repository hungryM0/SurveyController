package rpc

import (
	"context"
	"encoding/json"
	"errors"
	"io"
)

type Handler interface {
	Handle(context.Context, string, json.RawMessage) (any, error)
}

type Server struct {
	reader  io.Reader
	writer  io.Writer
	handler Handler
}

func NewServer(reader io.Reader, writer io.Writer, handler Handler) *Server {
	return &Server{reader: reader, writer: writer, handler: handler}
}

func (s *Server) Serve() error {
	for {
		var request Request
		if err := ReadFrame(s.reader, &request); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
		if err := s.writeResponse(context.Background(), request); err != nil {
			return err
		}
	}
}

func (s *Server) writeResponse(ctx context.Context, request Request) error {
	result, err := s.handler.Handle(ctx, request.Method, request.Params)
	response := Response{ID: request.ID}
	if err != nil {
		var rpcError *Error
		if errors.As(err, &rpcError) {
			response.Error = rpcError
		} else {
			response.Error = &Error{Code: "internal_error", Message: err.Error()}
		}
		return WriteFrame(s.writer, response)
	}
	payload, err := json.Marshal(result)
	if err != nil {
		response.Error = &Error{Code: "internal_error", Message: err.Error()}
	} else {
		response.Result = payload
	}
	return WriteFrame(s.writer, response)
}
