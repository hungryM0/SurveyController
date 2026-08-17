package answerplan

import (
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"github.com/SurveyController/SurveyController/packages/surveycore/internal/model"
)

const idCardChecksumChars = "10X98765432"

var idCardChecksumWeights = []int{7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2}

func randomIntegerText(intRange []int) string {
	if len(intRange) < 2 {
		return defaultFillText
	}
	return strconv.Itoa(randomIntInRange(intRange[0], intRange[1]))
}

func randomIntInRange(minValue int, maxValue int) int {
	if minValue > maxValue {
		minValue, maxValue = maxValue, minValue
	}
	if minValue == maxValue {
		return minValue
	}
	return minValue + rand.Intn(maxValue-minValue+1)
}

func randomChineseName(persona *model.Persona) string {
	surnames := []rune("张王李赵陈杨刘黄周吴徐孙马朱胡林郭何高罗郑梁谢宋唐韩曹许邓冯")
	maleGivenPool := []rune("伟俊涛强磊刚凯鹏鑫宇浩瑞博杰宁豪轩皓浩宇子豪思远家豪文博宇航志强明浩志伟文涛梓豪志鹏伟豪君豪承泽")
	femaleGivenPool := []rune("婷雅静怡欣萱琳玲芳颖慧敏雪晶莉倩蕾佳媛茜悦岚蓉瑶诗梦菲琪韵彤璐")
	neutralGivenPool := []rune("嘉明华建安晨泽文超洋")
	givenPool := append(append([]rune(nil), maleGivenPool...), femaleGivenPool...)
	givenPool = append(givenPool, neutralGivenPool...)
	if persona != nil {
		switch persona.Gender {
		case "男":
			givenPool = append(append([]rune(nil), maleGivenPool...), neutralGivenPool...)
		case "女":
			givenPool = append(append([]rune(nil), femaleGivenPool...), neutralGivenPool...)
		}
	}
	surname := string(surnames[rand.Intn(len(surnames))])
	givenLen := 1
	if rand.Float64() >= 0.65 {
		givenLen = 2
	}
	var builder strings.Builder
	builder.WriteString(surname)
	for index := 0; index < givenLen; index++ {
		builder.WriteRune(givenPool[rand.Intn(len(givenPool))])
	}
	return builder.String()
}

func randomMobile() string {
	prefixes := []string{
		"130", "131", "132", "133", "134", "135", "136", "137", "138", "139",
		"147", "150", "151", "152", "153", "155", "156", "157", "158", "159",
		"166", "171", "172", "173", "175", "176", "177", "178", "180", "181",
		"182", "183", "184", "185", "186", "187", "188", "189", "198", "199",
	}
	var builder strings.Builder
	builder.WriteString(prefixes[rand.Intn(len(prefixes))])
	for index := 0; index < 8; index++ {
		builder.WriteByte(byte('0' + rand.Intn(10)))
	}
	return builder.String()
}

func randomIDCard(persona *model.Persona) string {
	areaCodes := []string{"110100", "310100", "440100", "330100", "510100"}
	minAge, maxAge := personaAgeRange(persona)
	age := randomIntInRange(minAge, maxAge)
	year := time.Now().Year() - age
	start := time.Date(year, 1, 1, 0, 0, 0, 0, time.Local)
	birthday := start.AddDate(0, 0, rand.Intn(365))
	prefix := fmt.Sprintf("%s%s%02d%d", areaCodes[rand.Intn(len(areaCodes))], birthday.Format("20060102"), rand.Intn(100), personaGenderDigit(persona))
	return prefix + string(idCardChecksum(prefix))
}

func personaAgeRange(persona *model.Persona) (int, int) {
	if persona == nil {
		return 18, 60
	}
	switch persona.AgeGroup {
	case "18-25":
		return 18, 25
	case "26-35":
		return 26, 35
	case "36-45":
		return 36, 45
	case "46-60":
		return 46, 60
	default:
		return 18, 60
	}
}

func personaGenderDigit(persona *model.Persona) int {
	if persona != nil {
		switch persona.Gender {
		case "男":
			return []int{1, 3, 5, 7, 9}[rand.Intn(5)]
		case "女":
			return []int{0, 2, 4, 6, 8}[rand.Intn(5)]
		}
	}
	return rand.Intn(10)
}

func idCardChecksum(firstSeventeen string) byte {
	if len(firstSeventeen) != 17 {
		return '0'
	}
	total := 0
	for index, char := range firstSeventeen {
		if char < '0' || char > '9' || index >= len(idCardChecksumWeights) {
			return '0'
		}
		total += int(char-'0') * idCardChecksumWeights[index]
	}
	return idCardChecksumChars[total%11]
}

func randomGeneric() string {
	samples := []string{"已填写", "同上", "无", "OK", "收到", "确认", "正常", "通过", "测试数据", "自动填写"}
	return samples[rand.Intn(len(samples))] + strconv.Itoa(randomIntInRange(10, 999))
}
