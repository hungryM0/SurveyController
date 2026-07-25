package configio

import (
	"bytes"
	"encoding/json"
	"fmt"

	"surveycontroller/surveycore"
)

func SerializeConfigDocument(document ConfigDocument) (map[string]any, error) {
	if document.SchemaVersion == 0 {
		document.SchemaVersion = ConfigSchemaVersion
	}
	data, err := json.Marshal(document)
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func DeserializeConfigDocument(payload map[string]any) (ConfigDocument, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return ConfigDocument{}, err
	}
	var document ConfigDocument
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&document); err != nil {
		return ConfigDocument{}, fmt.Errorf("v2 配置字段无效：%w", err)
	}
	if document.SchemaVersion != ConfigSchemaVersion {
		return ConfigDocument{}, fmt.Errorf("不支持的配置版本：%d", document.SchemaVersion)
	}
	return document, nil
}

func SerializeRunRequest(config surveycore.RunRequest) map[string]any {
	payload, _ := SerializeConfigDocument(ConfigDocumentFromRunRequest(config))
	return payload
}

func DeserializeRunRequest(payload map[string]any) (surveycore.RunRequest, error) {
	if _, ok := payload["schemaVersion"]; ok {
		document, err := DeserializeConfigDocument(payload)
		if err != nil {
			return surveycore.RunRequest{}, err
		}
		return RunRequestFromConfigDocument(document)
	}
	document, err := migrateLegacyDocument(payload)
	if err != nil {
		return surveycore.RunRequest{}, err
	}
	return RunRequestFromConfigDocument(document)
}
