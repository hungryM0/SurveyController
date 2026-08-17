package surveycore

import (
	"fmt"
	"time"

	"github.com/SurveyController/SurveyController/packages/surveycore/credamo"
	"github.com/SurveyController/SurveyController/packages/surveycore/tencent"
	"github.com/SurveyController/SurveyController/packages/surveycore/wjx"
)

func resultFromTencent(result tencent.Result) *RunResult {
	return platformRunResult(result.Success, result.Fail, result.Target, result.Status, result.Status == "stopped")
}

func resultFromWJX(result wjx.Result) *RunResult {
	return platformRunResult(result.Success, result.Fail, result.Target, result.Status, result.Status == "stopped")
}

func resultFromCredamo(result credamo.Result) *RunResult {
	return platformRunResult(result.Success, result.Fail, result.Target, result.Status, false)
}

func platformRunResult(success int, fail int, target int, status string, stopped bool) *RunResult {
	progress := ThreadProgress{
		ThreadName:   "Worker-1",
		ThreadIndex:  0,
		SuccessCount: success,
		FailCount:    fail,
		StepCurrent:  success + fail,
		StepTotal:    target,
		StatusText:   status,
		Running:      false,
		LastUpdate:   time.Now(),
	}
	return &RunResult{
		Success:        success,
		Fail:           fail,
		Stopped:        stopped,
		ThreadProgress: []ThreadProgress{progress},
	}
}

func wrapRunError(err error) error {
	if err == nil {
		return nil
	}
	switch ClassifyRunError(err) {
	case ErrorKindCanceled:
		return err
	case ErrorKindParse:
		return fmt.Errorf("%w: %w", ErrParseFailed, err)
	case ErrorKindConfig:
		return fmt.Errorf("%w: %w", ErrPrepareConfigFailed, err)
	case ErrorKindUnsupported:
		return fmt.Errorf("%w: %w", ErrUnsupportedOperation, err)
	default:
		return fmt.Errorf("%w: %w", ErrRunFailed, err)
	}
}
