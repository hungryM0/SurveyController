package model

import "fmt"

func OptionWeights(values ...float64) WeightTable {
	return WeightTable{Options: append([]float64(nil), values...)}
}

func RowWeights(rows ...[]float64) WeightTable {
	return WeightTable{Rows: cloneFloatRows(rows)}
}

func (w WeightTable) Validate() error {
	if len(w.Options) > 0 && len(w.Rows) > 0 {
		return fmt.Errorf("选项权重和矩阵权重不能同时设置")
	}
	for rowIndex, row := range w.Rows {
		if len(row) == 0 {
			return fmt.Errorf("第%d行矩阵权重为空", rowIndex+1)
		}
	}
	return nil
}

func (w WeightTable) Values() []float64 {
	return append([]float64(nil), w.Options...)
}

func (w WeightTable) Row(row int) []float64 {
	if row < 0 || row >= len(w.Rows) {
		return nil
	}
	return append([]float64(nil), w.Rows[row]...)
}

func (w WeightTable) Clone() WeightTable {
	return WeightTable{
		Options: append([]float64(nil), w.Options...),
		Rows:    cloneFloatRows(w.Rows),
	}
}

func cloneFloatRows(rows [][]float64) [][]float64 {
	if len(rows) == 0 {
		return nil
	}
	cloned := make([][]float64, len(rows))
	for index := range rows {
		cloned[index] = append([]float64(nil), rows[index]...)
	}
	return cloned
}
