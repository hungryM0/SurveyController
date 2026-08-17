package tencent

import (
	"context"
	"sync"
	"time"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/httpjson"
	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

type ParseError struct {
	Message string
}

func (e ParseError) Error() string {
	return e.Message
}

type Parser struct {
	HTTP interface {
		DoJSON(ctx context.Context, method string, url string, headers map[string]string, body any, out any) error
	}
	UserAgent string
}

type apiEnvelope struct {
	Code    any `json:"code"`
	Message any `json:"message"`
	Msg     any `json:"msg"`
	Data    any `json:"data"`
}

type Event struct {
	Worker  string
	Message string
	Success bool
	Fail    bool
	Current int
	Total   int
	Time    time.Time
}

type Result struct {
	Success int
	Fail    int
	Target  int
	Status  string
}

type EventHandler func(Event)

type Runner struct {
	HTTP interface {
		DoJSON(ctx context.Context, method string, url string, headers map[string]string, body any, out any) error
	}
	UserAgent string
}

type PreparedSurvey struct {
	Definition        model.SurveyDefinition
	SurveyID          string
	Hash              string
	PageURL           string
	RawQuestions      []map[string]any
	seedMu            sync.Mutex
	seedUsed          bool
	seedAnswerSession string
	seedSessionData   map[string]any
}

func (p *PreparedSurvey) takeSeedSession() (string, map[string]any, bool) {
	if p == nil {
		return "", nil, false
	}
	p.seedMu.Lock()
	defer p.seedMu.Unlock()
	if p.seedUsed {
		return "", nil, false
	}
	p.seedUsed = true
	return p.seedAnswerSession, p.seedSessionData, true
}

func httpDoerOrDefault(client interface {
	DoJSON(ctx context.Context, method string, url string, headers map[string]string, body any, out any) error
}) interface {
	DoJSON(ctx context.Context, method string, url string, headers map[string]string, body any, out any) error
} {
	if client != nil {
		return client
	}
	return httpjson.Client{}
}
