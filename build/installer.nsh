; Explorer integration for the per-user NSIS installer.
;  - right-click on an image  -> "Crea PDF con Immagini in PDF"
;  - "Apri con"               -> Immagini in PDF (the default viewer is NOT changed)
;  - "Invia a"                -> Immagini in PDF (best for many files at once)
; Everything lives in HKCU, so no administrator rights are needed.

!define IIP_PROGID "ImmaginiInPDF.Image"
!define IIP_VERB "ImmaginiInPDF"

!macro IIP_REGISTER_EXT EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${IIP_VERB}" "MUIVerb" "Crea PDF con Immagini in PDF"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${IIP_VERB}" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${IIP_VERB}" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${IIP_VERB}\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\${EXT}\OpenWithProgids" "${IIP_PROGID}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${EXT}" ""
!macroend

!macro IIP_UNREGISTER_EXT EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\${IIP_VERB}"
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "${IIP_PROGID}"
!macroend

!macro IIP_ALL_EXT MACRO
  !insertmacro ${MACRO} ".jpg"
  !insertmacro ${MACRO} ".jpeg"
  !insertmacro ${MACRO} ".jfif"
  !insertmacro ${MACRO} ".png"
  !insertmacro ${MACRO} ".gif"
  !insertmacro ${MACRO} ".bmp"
  !insertmacro ${MACRO} ".webp"
  !insertmacro ${MACRO} ".avif"
  !insertmacro ${MACRO} ".heic"
  !insertmacro ${MACRO} ".heif"
  !insertmacro ${MACRO} ".tif"
  !insertmacro ${MACRO} ".tiff"
  !insertmacro ${MACRO} ".svg"
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\Classes\${IIP_PROGID}" "" "Immagine (Immagini in PDF)"
  WriteRegStr HKCU "Software\Classes\${IIP_PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\${IIP_PROGID}\shell\open" "FriendlyAppName" "Immagini in PDF"
  WriteRegStr HKCU "Software\Classes\${IIP_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "Immagini in PDF"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  !insertmacro IIP_ALL_EXT IIP_REGISTER_EXT

  CreateShortCut "$SENDTO\Immagini in PDF.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0

  ; Tell Explorer the associations changed.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro IIP_ALL_EXT IIP_UNREGISTER_EXT
  DeleteRegKey HKCU "Software\Classes\${IIP_PROGID}"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  Delete "$SENDTO\Immagini in PDF.lnk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
