"""运行时钩子：在 PySide6 加载前设置 DLL 搜索路径

这个钩子在所有 Python import 之前执行。
由于使用 contents_directory='.'（扁平化目录），需要手动设置 PySide6 的 DLL 路径。
"""
import os
import sys

if getattr(sys, 'frozen', False):
    # 冻结模式下，sys._MEIPASS 是 PyInstaller 解包的临时目录
    # 但 contents_directory='.' 时，所有文件直接在 exe 同目录
    app_dir = os.path.dirname(sys.executable)

    pyside6_dir = os.path.join(app_dir, 'PySide6')
    shiboken6_dir = os.path.join(app_dir, 'shiboken6')
    qt_dir = os.path.join(pyside6_dir, 'Qt')
    qt_libexec_dir = os.path.join(qt_dir, 'libexec')
    qt_resources_dir = os.path.join(qt_dir, 'resources')
    qt_webengine_locales_dir = os.path.join(qt_dir, 'translations', 'qtwebengine_locales')
    qt_webengine_locales_fallback_dir = os.path.join(pyside6_dir, 'translations', 'qtwebengine_locales')
    # numpy 的 delvewheel 补丁在 import numpy 时才运行，时序上可能太晚
    # 在此提前注册，确保 libscipy_openblas64_ 等 DLL 能被 Windows 加载器找到
    numpy_libs_dir = os.path.join(app_dir, 'numpy.libs')

    # 1. 添加到 PATH（必须在 PySide6.__init__ 之前）
    dirs_to_add = []
    if os.path.isdir(pyside6_dir):
        dirs_to_add.append(pyside6_dir)
    if os.path.isdir(qt_libexec_dir):
        dirs_to_add.append(qt_libexec_dir)
    if os.path.isdir(shiboken6_dir):
        dirs_to_add.append(shiboken6_dir)
    if os.path.isdir(numpy_libs_dir):
        dirs_to_add.append(numpy_libs_dir)

    if dirs_to_add:
        os.environ['PATH'] = os.pathsep.join(dirs_to_add) + os.pathsep + os.environ.get('PATH', '')

    # 2. 使用 os.add_dll_directory（Python 3.8+ / Windows 10 1607+）
    if hasattr(os, 'add_dll_directory'):
        for d in dirs_to_add:
            try:
                os.add_dll_directory(d)
            except OSError:
                pass

    # 3. 用 ctypes 显式预加载 numpy.libs 里的所有 DLL
    # 原因：Windows DLL 加载器在处理依赖链时不走 os.add_dll_directory 的路径，
    # 提前把 DLL 加载进进程内存后，后续加载 _multiarray_umath.pyd 时就能直接命中缓存
    if os.path.isdir(numpy_libs_dir):
        import ctypes
        import glob
        # 先加载 msvcp140 变体（libscipy_openblas64_ 依赖它）
        for dll_path in sorted(glob.glob(os.path.join(numpy_libs_dir, '*.dll'))):
            try:
                ctypes.WinDLL(dll_path)
            except OSError:
                pass

    # 4. 设置 Qt 插件路径
    plugins_dir = os.path.join(pyside6_dir, 'plugins')
    if os.path.isdir(plugins_dir):
        os.environ['QT_PLUGIN_PATH'] = plugins_dir

    # 5. 显式设置 Qt WebEngine 资源路径，避免打包后 helper 进程找不到资源直接暴毙
    webengine_process_path = os.path.join(qt_libexec_dir, 'QtWebEngineProcess.exe')
    if os.path.isfile(webengine_process_path):
        os.environ.setdefault('QTWEBENGINEPROCESS_PATH', webengine_process_path)
    if os.path.isdir(qt_resources_dir):
        os.environ.setdefault('QTWEBENGINE_RESOURCES_PATH', qt_resources_dir)
    if os.path.isdir(qt_webengine_locales_dir):
        os.environ.setdefault('QTWEBENGINE_LOCALES_PATH', qt_webengine_locales_dir)
    elif os.path.isdir(qt_webengine_locales_fallback_dir):
        os.environ.setdefault('QTWEBENGINE_LOCALES_PATH', qt_webengine_locales_fallback_dir)
