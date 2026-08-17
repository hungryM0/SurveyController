package main

import (
	"os"

	"github.com/SurveyController/SurveyController/packages/surveycore/configio"
)

type configRepository interface {
	LoadSettings() (AppSettings, string, error)
	SaveSettings(AppSettings) (AppSettings, error)
	LoadDocument(path string) (configio.ConfigDocument, error)
	SaveDocument(document configio.ConfigDocument, path string) (string, error)
	ReadFile(path string) ([]byte, error)
}

type fileConfigRepository struct{}

func (fileConfigRepository) LoadSettings() (AppSettings, string, error) {
	return loadAppSettings()
}

func (fileConfigRepository) SaveSettings(settings AppSettings) (AppSettings, error) {
	return saveAppSettings(settings)
}

func (fileConfigRepository) LoadDocument(path string) (configio.ConfigDocument, error) {
	return configio.LoadDocument(path, true)
}

func (fileConfigRepository) SaveDocument(document configio.ConfigDocument, path string) (string, error) {
	return configio.SaveDocument(document, path)
}

func (fileConfigRepository) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}
