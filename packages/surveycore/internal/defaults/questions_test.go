package defaults

import (
	"testing"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

func TestQuestionTypeDoesNotTreatUnknownAsText(t *testing.T) {
	if got := QuestionType(model.QuestionMeta{ProviderType: "new_platform_widget", TypeCode: "99"}); got != "" {
		t.Fatalf("question type = %q", got)
	}
}

func TestQuestionTypeRecognizesTextMetadata(t *testing.T) {
	if got := QuestionType(model.QuestionMeta{ProviderType: "new_text_alias", TypeCode: "99", IsTextLike: true}); got != "text" {
		t.Fatalf("question type = %q", got)
	}
}
