package main

const startupTutorialDocURL = "https://surveydoc.hungrym0.com/"

type StartupTutorialHintState struct {
	ShouldShow bool   `json:"shouldShow"`
	DocURL     string `json:"docUrl"`
}

func (s *AppService) GetStartupTutorialHint() (StartupTutorialHintState, error) {
	settings, err := loadAppSettings()
	if err != nil {
		return StartupTutorialHintState{}, err
	}
	return StartupTutorialHintState{
		ShouldShow: !settings.StartupTutorialHintSeen,
		DocURL:     startupTutorialDocURL,
	}, nil
}

func (s *AppService) DismissStartupTutorialHint() (AppSettings, error) {
	settings, err := loadAppSettings()
	if err != nil {
		return AppSettings{}, err
	}
	settings.StartupTutorialHintSeen = true
	return saveAppSettings(settings)
}
