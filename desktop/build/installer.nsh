; Depois de instalar ou atualizar: avisa o Windows para redesenhar os ícones
; (atalho da área de trabalho, menu Iniciar e barra de tarefas mostram o ícone novo na hora).
!macro customInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
