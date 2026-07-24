package runerror

import (
	"context"
	"errors"
)

type Kind string

const (
	KindParse       Kind = "parse"
	KindConfig      Kind = "config"
	KindUnsupported Kind = "unsupported"
	KindRun         Kind = "run"
)

type Error struct {
	Kind Kind
	Err  error
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Err == nil {
		return string(e.Kind)
	}
	return e.Err.Error()
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func Wrap(kind Kind, err error) error {
	if err == nil || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	var typed *Error
	if errors.As(err, &typed) {
		return err
	}
	return &Error{Kind: kind, Err: err}
}

func KindOf(err error) (Kind, bool) {
	var typed *Error
	if !errors.As(err, &typed) || typed == nil {
		return "", false
	}
	return typed.Kind, true
}

func HasKind(err error, kind Kind) bool {
	got, ok := KindOf(err)
	return ok && got == kind
}
