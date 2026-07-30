package surveycore

import (
	"context"
	"errors"
	"time"

	"surveycontroller/surveycore/internal/model"
	"surveycontroller/surveycore/internal/runerror"
)

type ErrorKind string

const (
	ErrorKindCanceled    ErrorKind = "canceled"
	ErrorKindParse       ErrorKind = "parse"
	ErrorKindConfig      ErrorKind = "config"
	ErrorKindUnsupported ErrorKind = "unsupported"
	ErrorKindRun         ErrorKind = "run"
)

type ExecutionLease struct {
	Address string
	Source  string
}

type LeaseManager interface {
	Acquire(ctx context.Context, owner string) (ExecutionLease, error)
	Release(owner string) (ExecutionLease, bool)
	MarkSuccess(proxyAddress string) bool
	MarkCooldown(proxyAddress string, cooldownFor time.Duration)
}

type PauseController interface {
	IsPaused() bool
	WaitIfPaused(ctx context.Context) error
}

type ExecutionOptions struct {
	Target            int
	Threads           int
	MaxRetries        int
	FailStop          bool
	FailStopThreshold int
	UseRandomIP       bool
	RetryDelay        time.Duration
	CooldownOnError   time.Duration
	LeaseManager      LeaseManager
	PauseController   PauseController
	Now               func() time.Time
	UserAgent         model.UserAgentSettings
	AIProfile         model.AIProfile
	AnswerRuntime     model.AnswerRuntime
	ConfigureJob      func(ctx context.Context, jobIndex int, attempt int, job *JobRequest) error
}

type JobRequest struct {
	Answers    model.AnswerPlan
	Submission model.SubmissionRequest
}

type SubmitFunc func(ctx context.Context, request *model.SubmissionRequest, handler EventHandler) (*RunResult, error)

func ClassifyRunError(err error) ErrorKind {
	if err == nil {
		return ""
	}
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return ErrorKindCanceled
	case errors.Is(err, ErrUnsupportedOperation):
		return ErrorKindUnsupported
	case errors.Is(err, ErrInvalidConfig), errors.Is(err, ErrPrepareConfigFailed):
		return ErrorKindConfig
	case errors.Is(err, ErrParseFailed):
		return ErrorKindParse
	}
	if kind, ok := runerror.KindOf(err); ok {
		switch kind {
		case runerror.KindParse:
			return ErrorKindParse
		case runerror.KindConfig:
			return ErrorKindConfig
		case runerror.KindUnsupported:
			return ErrorKindUnsupported
		case runerror.KindRun:
			return ErrorKindRun
		}
	}
	return ErrorKindRun
}
