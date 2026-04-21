"""问卷结构转换器。

将 RunController 的问卷信息转换为 SurveySchema。
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from software.ui.controller.run_controller import RunController

from software.io.excel.schema import SurveySchema, QuestionSchema, OptionSchema


def convert_to_survey_schema(controller: RunController) -> SurveySchema:
    """将 RunController 的问卷信息转换为 SurveySchema。
    
    Args:
        controller: RunController 实例
        
    Returns:
        SurveySchema 对象
        
    Raises:
        ValueError: 如果问卷未解析
    """
    if not hasattr(controller, 'surveyParsed') or not controller.surveyParsed:
        raise ValueError("问卷未解析")
    
    # 获取问卷标题
    survey_title = getattr(controller, 'survey_title', '未命名问卷')
    
    # 获取题目信息
    questions_info = getattr(controller, 'questions_info', None)
    if not questions_info:
        raise ValueError("问卷题目信息为空")
    
    # 转换题目
    questions = []
    for idx, q_info in enumerate(questions_info, start=1):
        question = _convert_question(idx, q_info)
        if question:
            questions.append(question)
    
    if not questions:
        raise ValueError("没有有效的题目")
    
    return SurveySchema(
        title=survey_title,
        questions=questions,
    )


def _convert_question(index: int, q_info: dict) -> QuestionSchema:
    """转换单个题目。
    
    Args:
        index: 题目序号（从 1 开始）
        q_info: 题目信息字典
        
    Returns:
        QuestionSchema 对象
    """
    # 获取题目 ID
    qid = f"Q{index}"
    
    # 获取题目标题
    title = q_info.get('title', '') or q_info.get('text', '') or f"题目 {index}"
    
    # 获取题目类型
    qtype_raw = q_info.get('type', 'unknown')
    qtype = _normalize_question_type(qtype_raw)
    
    # 获取是否必填
    required = q_info.get('required', True)
    
    # 获取选项
    options = []
    options_raw = q_info.get('options', [])
    
    if isinstance(options_raw, list):
        for opt_info in options_raw:
            option = _convert_option(opt_info)
            if option:
                options.append(option)
    
    return QuestionSchema(
        qid=qid,
        index=index,
        title=title,
        qtype=qtype,
        required=required,
        options=options,
    )


def _convert_option(opt_info: Any) -> OptionSchema:
    """转换选项。
    
    Args:
        opt_info: 选项信息（可能是字符串或字典）
        
    Returns:
        OptionSchema 对象
    """
    if isinstance(opt_info, str):
        # 简单字符串选项
        return OptionSchema(text=opt_info)
    
    elif isinstance(opt_info, dict):
        # 字典选项
        text = opt_info.get('text', '') or opt_info.get('label', '') or str(opt_info.get('value', ''))
        value = opt_info.get('value')
        
        return OptionSchema(text=text, value=value)
    
    else:
        # 其他类型，转为字符串
        return OptionSchema(text=str(opt_info))


def _normalize_question_type(qtype_raw: str) -> str:
    """标准化题目类型。
    
    Args:
        qtype_raw: 原始题目类型
        
    Returns:
        标准化后的题目类型
    """
    qtype_lower = str(qtype_raw).lower()
    
    # 单选题
    if any(x in qtype_lower for x in ['single', 'radio', '单选']):
        return 'single_choice'
    
    # 多选题
    if any(x in qtype_lower for x in ['multiple', 'checkbox', '多选']):
        return 'multi_choice'
    
    # 文本题
    if any(x in qtype_lower for x in ['text', 'textarea', '文本', '填空']):
        return 'text'
    
    # 量表题
    if any(x in qtype_lower for x in ['scale', 'rating', 'likert', '量表', '评分']):
        return 'scale'
    
    # 矩阵题
    if any(x in qtype_lower for x in ['matrix', '矩阵']):
        return 'matrix'
    
    # 下拉题
    if any(x in qtype_lower for x in ['dropdown', 'select', '下拉']):
        return 'single_choice'
    
    # 默认为单选
    return 'single_choice'
