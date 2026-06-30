package main

import (
	"context"
	"errors"
	"strings"

	"surveycontroller/proxycore"
)

const randomIPBonusCode = "fuck-you-hacker"

type RandomIPBonusState struct {
	Claimed      bool    `json:"claimed"`
	BonusQuota   float64 `json:"bonusQuota"`
	Detail       string  `json:"detail,omitempty"`
	PlayConfetti bool    `json:"playConfetti"`
}

func (s *AppService) ClaimRandomIPBonus(ctx context.Context) (RandomIPBonusState, error) {
	client := s.proxyRuntime().officialProxyClient()
	result, err := client.ClaimBonus(ctx, randomIPBonusCode)
	if err != nil {
		var apiErr proxycore.RandomIPError
		if !errors.As(err, &apiErr) {
			return RandomIPBonusState{}, err
		}
		detail := strings.TrimSpace(apiErr.Detail)
		if detail == "bonus_already_claimed" || detail == "easter_egg_already_claimed" {
			if _, saveErr := s.MarkRandomIPBonusPlayed(); saveErr != nil {
				return RandomIPBonusState{}, saveErr
			}
			return RandomIPBonusState{Detail: detail}, nil
		}
		if detail == "bonus_claim_not_available" || detail == "easter_egg_not_available" {
			return RandomIPBonusState{Detail: detail}, nil
		}
		return RandomIPBonusState{}, err
	}
	if result.Claimed || strings.TrimSpace(result.Detail) == "bonus_already_claimed" || strings.TrimSpace(result.Detail) == "easter_egg_already_claimed" {
		if _, saveErr := s.MarkRandomIPBonusPlayed(); saveErr != nil {
			return RandomIPBonusState{}, saveErr
		}
	}
	return RandomIPBonusState{
		Claimed:      result.Claimed,
		BonusQuota:   result.BonusQuota,
		Detail:       strings.TrimSpace(result.Detail),
		PlayConfetti: result.Claimed,
	}, nil
}

func (s *AppService) MarkRandomIPBonusPlayed() (AppSettings, error) {
	settings, err := loadAppSettings()
	if err != nil {
		return AppSettings{}, err
	}
	settings.RandomIPBonusPlayed = true
	return saveAppSettings(settings)
}

func mapRandomIPBonusError(err error) string {
	if err == nil {
		return ""
	}
	if apiErr, ok := err.(proxycore.RandomIPError); ok {
		switch apiErr.Detail {
		case "bonus_already_claimed", "easter_egg_already_claimed":
			return "彩蛋已触发，无需重复领取"
		case "bonus_claim_not_available", "easter_egg_not_available":
			return "当前暂时无法领取彩蛋奖励，请稍后再试"
		}
	}
	return err.Error()
}
