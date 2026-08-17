package main

const maxRunTaskStateEvents = 200

type runEventWindow struct {
	events  []RunTaskEvent
	start   int
	length  int
	next    uint64
	dropped uint64
}

func newRunEventWindow() runEventWindow {
	return runEventWindow{events: make([]RunTaskEvent, maxRunTaskStateEvents)}
}

func (w *runEventWindow) append(event RunTaskEvent) RunTaskEvent {
	w.next++
	event.Sequence = w.next
	if len(w.events) == 0 {
		return event
	}
	if w.length < len(w.events) {
		index := (w.start + w.length) % len(w.events)
		w.events[index] = event
		w.length++
		return event
	}
	w.events[w.start] = event
	w.start = (w.start + 1) % len(w.events)
	w.dropped++
	return event
}

func (w *runEventWindow) snapshot(afterSequence uint64) []RunTaskEvent {
	if w.length == 0 {
		return nil
	}
	events := make([]RunTaskEvent, 0, w.length)
	for offset := 0; offset < w.length; offset++ {
		event := w.events[(w.start+offset)%len(w.events)]
		if event.Sequence > afterSequence {
			events = append(events, event)
		}
	}
	return events
}

func (w *runEventWindow) nextSequence() uint64 {
	return w.next
}

func (w *runEventWindow) droppedEvents() uint64 {
	return w.dropped
}
