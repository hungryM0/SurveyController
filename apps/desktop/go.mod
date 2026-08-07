module github.com/hungrym0/SurveyController/apps/desktop

go 1.26

require (
	github.com/makiuchi-d/gozxing v0.1.1
	github.com/xuri/excelize/v2 v2.10.1
	golang.org/x/sys v0.47.0
	surveycontroller/proxycore v0.0.0
	surveycontroller/surveycore v0.0.0
)

replace surveycontroller/proxycore => ../../packages/proxycore

replace surveycontroller/surveycore => ../../packages/surveycore

require (
	github.com/richardlehane/mscfb v1.0.6 // indirect
	github.com/richardlehane/msoleps v1.0.6 // indirect
	github.com/tiendc/go-deepcopy v1.7.2 // indirect
	github.com/xuri/efp v0.0.1 // indirect
	github.com/xuri/nfp v0.0.2-0.20250530014748-2ddeb826f9a9 // indirect
	golang.org/x/crypto v0.54.0 // indirect
	golang.org/x/net v0.57.0 // indirect
	golang.org/x/text v0.40.0 // indirect
	golang.org/x/xerrors v0.0.0-20200804184101-5ec99f83aff1 // indirect
)
