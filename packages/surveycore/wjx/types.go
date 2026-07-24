package wjx

import (
	"net/http"
	"time"

	"surveycontroller/surveycore/internal/model"
)

type ParseError struct {
	Message string
}

func (e ParseError) Error() string {
	return e.Message
}

type Parser struct {
	Client    *http.Client
	UserAgent string
}

type Runner struct {
	Client    *http.Client
	UserAgent string
}

type PreparedSurvey struct {
	Definition model.SurveyDefinition
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

type EventHandler func(Event)

type Result struct {
	Success int
	Fail    int
	Target  int
	Status  string
}

type rawPage struct {
	HTML       string
	Definition any
}

type httpDoer interface {
	Do(req *http.Request) (*http.Response, error)
}
