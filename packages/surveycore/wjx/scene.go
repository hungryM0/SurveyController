package wjx

import (
	"html"
	"regexp"
	"strings"
)

const defaultSceneID = "q0hcfsca"

var sceneIDPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bsceneId\s*[:=]\s*["']([^"']+)["']`),
	regexp.MustCompile(`(?i)\bscene_id\s*[:=]\s*["']([^"']+)["']`),
	regexp.MustCompile(`(?i)\bdata-scene-id\s*=\s*["']([^"']+)["']`),
}

func extractSceneID(htmlText string) string {
	unescaped := html.UnescapeString(htmlText)
	for _, pattern := range sceneIDPatterns {
		matches := pattern.FindStringSubmatch(unescaped)
		if len(matches) > 1 {
			if value := strings.TrimSpace(matches[1]); value != "" {
				return value
			}
		}
	}
	return ""
}
