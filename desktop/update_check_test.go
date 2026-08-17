package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCheckForUpdateUsesNewestFullStableRelease(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/feed":
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"Assets":[{"Version":"5.2.0","Type":"Delta"},{"Version":"5.1.0","Type":"Full"},{"Version":"5.0.1","Type":"Full"}]}`))
		case "/release/v5.1.0":
			if request.Header.Get("Accept") != "application/vnd.github+json" {
				t.Fatalf("Accept = %q", request.Header.Get("Accept"))
			}
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"html_url":"https://example.test/releases/v5.1.0","body":"修复更新检查"}`))
		default:
			t.Fatalf("unexpected request %s", request.URL.Path)
		}
	}))
	defer server.Close()

	state, err := checkForUpdateWithClient(
		context.Background(),
		checkUpdateRequest{CurrentVersion: "5.0.0"},
		server.Client(),
		server.URL+"/feed",
		server.URL+"/release",
		server.URL+"/releases/tag",
	)
	if err != nil {
		t.Fatalf("checkForUpdateWithClient() error = %v", err)
	}
	if state.Status != "outdated" || state.LatestVersion != "5.1.0" {
		t.Fatalf("state = %#v", state)
	}
	if state.DownloadURL != "https://example.test/releases/v5.1.0" || state.ReleaseNotes != "修复更新检查" {
		t.Fatalf("state = %#v", state)
	}
}

func TestCheckForUpdateKeepsFeedResultWhenReleaseNotesFail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/feed":
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"Assets":[{"Version":"5.1.0","Type":"Full"}]}`))
		case "/release/v5.1.0":
			writer.WriteHeader(http.StatusServiceUnavailable)
		default:
			t.Fatalf("unexpected request %s", request.URL.Path)
		}
	}))
	defer server.Close()

	state, err := checkForUpdateWithClient(
		context.Background(),
		checkUpdateRequest{CurrentVersion: "5.0.0"},
		server.Client(),
		server.URL+"/feed",
		server.URL+"/release",
		server.URL+"/releases/tag",
	)
	if err != nil {
		t.Fatalf("checkForUpdateWithClient() error = %v", err)
	}
	if state.Status != "outdated" || state.DownloadURL != server.URL+"/releases/tag/v5.1.0" || state.ReleaseNotes != "" {
		t.Fatalf("state = %#v", state)
	}
}

func TestCheckForUpdateReturnsUnknownWhenFeedHasNoFullRelease(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/feed" {
			t.Fatalf("unexpected request %s", request.URL.Path)
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"Assets":[{"Version":"5.1.0","Type":"Delta"}]}`))
	}))
	defer server.Close()

	state, err := checkForUpdateWithClient(
		context.Background(),
		checkUpdateRequest{CurrentVersion: "5.0.0"},
		server.Client(),
		server.URL+"/feed",
		server.URL+"/release",
		server.URL+"/releases/tag",
	)
	if err != nil {
		t.Fatalf("checkForUpdateWithClient() error = %v", err)
	}
	if state.Status != "unknown" || state.Message != "远端未提供可用版本" {
		t.Fatalf("state = %#v", state)
	}
}
