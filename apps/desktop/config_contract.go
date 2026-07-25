package main

import (
	"context"
	"fmt"
	"strings"

	"surveycontroller/surveycore"
	"surveycontroller/surveycore/configio"
)

func coreRunRequest(document configio.ConfigDocument) (surveycore.RunRequest, error) {
	request, err := configio.RunRequestFromConfigDocument(document)
	if err != nil {
		return surveycore.RunRequest{}, err
	}
	if strings.TrimSpace(request.SurveySource.URL) == "" {
		return surveycore.RunRequest{}, fmt.Errorf("问卷链接不能为空")
	}
	return request, nil
}

func defaultConfigDocument(ctx context.Context, client *surveycore.Client, surveyURL string) (configio.ConfigDocument, error) {
	config, err := client.DefaultConfig(ctx, strings.TrimSpace(surveyURL))
	if err != nil {
		return configio.ConfigDocument{}, err
	}
	document := configio.ConfigDocumentFromRunRequest(*config)
	document.Network = defaultNetworkSettings()
	return document, nil
}

func defaultNetworkSettings() configio.NetworkSettings {
	return configio.NetworkSettings{
		ProxySource:    "default",
		RandomUARatios: map[string]int{"wechat": 33, "mobile": 33, "pc": 34},
	}
}

func aiProfileForSettings(ctx context.Context, store credentialStore, settings AIProfileSettings) (surveycore.AIProfile, bool, error) {
	profile := settings.ProfileWithKey("")
	if strings.EqualFold(strings.TrimSpace(profile.Mode), "free") || strings.TrimSpace(profile.Mode) == "" {
		return profile, false, nil
	}
	key, configured, err := readAICredential(ctx, store)
	if err != nil {
		return surveycore.AIProfile{}, false, err
	}
	profile.APIKey = key
	return profile, configured, nil
}

func answerPlanUsesAI(plan surveycore.AnswerPlan) bool {
	for _, strategy := range plan.Strategies {
		if strategy.AIEnabled {
			return true
		}
		for _, fill := range strategy.OptionFillTexts {
			if fill != nil && strings.TrimSpace(*fill) == "__AI_FILL__" {
				return true
			}
		}
		for _, enabled := range strategy.MultiTextBlankAIFlags {
			if enabled {
				return true
			}
		}
	}
	return false
}
