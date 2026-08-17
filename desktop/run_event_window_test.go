package main

import (
	"testing"

	"surveycontroller/surveycore"
)

func TestRunEventWindowKeepsFixedCapacityAfterManyEvents(t *testing.T) {
	window := newRunEventWindow()
	for current := 1; current <= 100_000; current++ {
		window.append(RunTaskEvent{Event: surveycore.Event{Current: current}})
	}

	events := window.snapshot(0)
	if len(events) != maxRunTaskStateEvents || len(window.events) != maxRunTaskStateEvents || cap(window.events) != maxRunTaskStateEvents {
		t.Fatalf("window len=%d storage len=%d cap=%d", len(events), len(window.events), cap(window.events))
	}
	if events[0].Sequence != 99_801 || events[0].Event.Current != 99_801 {
		t.Fatalf("first event = %#v", events[0])
	}
	if events[len(events)-1].Sequence != 100_000 || events[len(events)-1].Event.Current != 100_000 {
		t.Fatalf("last event = %#v", events[len(events)-1])
	}
	if window.droppedEvents() != 99_800 {
		t.Fatalf("dropped = %d", window.droppedEvents())
	}
}

func TestRunEventWindowReturnsOnlyEventsAfterCursor(t *testing.T) {
	window := newRunEventWindow()
	for current := 1; current <= 12; current++ {
		window.append(RunTaskEvent{Event: surveycore.Event{Current: current}})
	}

	events := window.snapshot(9)
	if len(events) != 3 || events[0].Sequence != 10 || events[2].Sequence != 12 {
		t.Fatalf("events = %#v", events)
	}
}
