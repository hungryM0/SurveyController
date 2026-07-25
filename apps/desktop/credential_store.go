package main

import (
	"context"
	"errors"
)

var errCredentialUnavailable = errors.New("系统凭据存储不可用")

type credentialStore interface {
	Read(ctx context.Context, target string) (string, bool, error)
	Write(ctx context.Context, target string, secret string) error
	Delete(ctx context.Context, target string) error
}

const aiCredentialTarget = "SurveyController/ai/provider-key"

func readAICredential(ctx context.Context, store credentialStore) (string, bool, error) {
	if store == nil {
		return "", false, errCredentialUnavailable
	}
	return store.Read(ctx, aiCredentialTarget)
}
