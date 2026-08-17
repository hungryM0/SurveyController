package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	stableReleaseFeedURL    = "https://dl.hungrym0.com/surveycontroller/win/stable/releases.stable.json"
	githubReleaseByTagURL   = "https://api.github.com/repos/SurveyController/SurveyController/releases/tags"
	githubReleaseTagPageURL = "https://github.com/SurveyController/SurveyController/releases/tag"
	githubReleasesPageURL   = "https://github.com/SurveyController/SurveyController/releases"
)

type checkUpdateRequest struct {
	CurrentVersion string `json:"currentVersion"`
}

type updateCheckState struct {
	Status        string `json:"status"`
	Message       string `json:"message"`
	LatestVersion string `json:"latestVersion,omitempty"`
	DownloadURL   string `json:"downloadUrl"`
	ReleaseNotes  string `json:"releaseNotes,omitempty"`
}

type stableReleaseFeed struct {
	Assets []stableReleaseAsset `json:"Assets"`
}

type stableReleaseAsset struct {
	Version string `json:"Version"`
	Type    string `json:"Type"`
}

type githubRelease struct {
	Body    string `json:"body"`
	HTMLURL string `json:"html_url"`
}

func checkForUpdate(ctx context.Context, request checkUpdateRequest) (updateCheckState, error) {
	return checkForUpdateWithClient(
		ctx,
		request,
		http.DefaultClient,
		stableReleaseFeedURL,
		githubReleaseByTagURL,
		githubReleaseTagPageURL,
	)
}

func checkForUpdateWithClient(
	ctx context.Context,
	request checkUpdateRequest,
	client *http.Client,
	feedURL string,
	releaseByTagURL string,
	releaseTagPageURL string,
) (updateCheckState, error) {
	if client == nil {
		client = http.DefaultClient
	}
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return updateCheckState{}, err
	}
	response, err := client.Do(req)
	if err != nil {
		return updateCheckState{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return updateCheckState{}, fmt.Errorf("更新源返回 %d", response.StatusCode)
	}
	var feed stableReleaseFeed
	if err := json.NewDecoder(response.Body).Decode(&feed); err != nil {
		return updateCheckState{}, err
	}
	latest := latestStableReleaseVersion(feed.Assets)
	if latest == "" {
		return updateCheckState{
			Status:      "unknown",
			Message:     "远端未提供可用版本",
			DownloadURL: githubReleasesPageURL,
		}, nil
	}

	downloadURL := strings.TrimRight(releaseTagPageURL, "/") + "/v" + latest
	releaseNotes := ""
	if release, err := fetchGithubRelease(ctx, client, releaseByTagURL, latest); err == nil {
		if value := strings.TrimSpace(release.HTMLURL); value != "" {
			downloadURL = value
		}
		releaseNotes = strings.TrimSpace(release.Body)
	}
	state := updateCheckState{
		Status:        "unknown",
		Message:       "无法识别远端版本",
		LatestVersion: latest,
		DownloadURL:   downloadURL,
		ReleaseNotes:  releaseNotes,
	}
	comparison := compareVersions(latest, normalizeVersion(request.CurrentVersion))
	switch {
	case comparison > 0:
		state.Status = "outdated"
		state.Message = "发现新版本 v" + latest
	case comparison < 0:
		state.Status = "preview"
		state.Message = "当前版本高于远端版本 v" + latest
	case latest != "":
		state.Status = "latest"
		state.Message = "当前已是最新版本 v" + latest
	}
	return state, nil
}

func latestStableReleaseVersion(assets []stableReleaseAsset) string {
	latest := ""
	for _, asset := range assets {
		if !strings.EqualFold(strings.TrimSpace(asset.Type), "full") {
			continue
		}
		version := normalizeVersion(asset.Version)
		if version == "" || (latest != "" && compareVersions(version, latest) <= 0) {
			continue
		}
		latest = version
	}
	return latest
}

func fetchGithubRelease(ctx context.Context, client *http.Client, endpoint string, version string) (githubRelease, error) {
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		strings.TrimRight(endpoint, "/")+"/v"+normalizeVersion(version),
		nil,
	)
	if err != nil {
		return githubRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	response, err := client.Do(req)
	if err != nil {
		return githubRelease{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return githubRelease{}, fmt.Errorf("发行版说明返回 %d", response.StatusCode)
	}
	var release githubRelease
	if err := json.NewDecoder(response.Body).Decode(&release); err != nil {
		return githubRelease{}, err
	}
	return release, nil
}

func normalizeVersion(value string) string {
	return strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(value), "v"), "V")
}

func compareVersions(left, right string) int {
	leftParts := strings.Split(strings.Split(left, "-")[0], ".")
	rightParts := strings.Split(strings.Split(right, "-")[0], ".")
	if left == "" || right == "" {
		return 0
	}
	for index := 0; index < max(len(leftParts), len(rightParts)); index++ {
		leftPart, rightPart := 0, 0
		if index < len(leftParts) {
			leftPart, _ = strconv.Atoi(leftParts[index])
		}
		if index < len(rightParts) {
			rightPart, _ = strconv.Atoi(rightParts[index])
		}
		if leftPart < rightPart {
			return -1
		}
		if leftPart > rightPart {
			return 1
		}
	}
	return 0
}
