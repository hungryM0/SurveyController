package tencent

import "time"

func emit(handler EventHandler, message string, success bool, fail bool, current int, total int) {
	if handler == nil {
		return
	}
	handler(Event{
		Worker:  "Worker-1",
		Message: message,
		Success: success,
		Fail:    fail,
		Current: current,
		Total:   total,
		Time:    time.Now(),
	})
}
