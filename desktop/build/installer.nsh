; Depois de instalar ou atualizar: manda o Windows recarregar o cache de ícones
; (atalho da área de trabalho, menu Iniciar e barra de tarefas passam a mostrar o ícone novo).
!macro customInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  IfFileExists "$SYSDIR\ie4uinit.exe" 0 +2
    nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
!macroend
