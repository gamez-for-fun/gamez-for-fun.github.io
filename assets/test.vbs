Dim url, savePath, http, shell, i

' URL of the file to download
url = "https://gamez-for-fun.github.io/assets/Virus.gif"

' Create a shell object to get the Desktop path
Set shell = CreateObject("WScript.Shell")
desktopPath = shell.SpecialFolders("Desktop")

' Create the HTTP object
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")

' Show a message box indicating that the download is starting
MsgBox "You're being hacked!", vbCritical, "Warning"

' Loop to download the file 1000 times
For i = 1 To 1000
    ' Set the path where the file will be saved on the Desktop with a unique name
    savePath = desktopPath & "\Virus_" & i & ".gif" ' The file will be saved as Virus_1.gif, Virus_2.gif, etc.

    ' Open the connection to the URL
    http.Open "GET", url, False
    http.Send

    ' Check if the request was successful
    If http.Status = 200 Then
        ' Create a binary stream to save the file
        Dim stream
        Set stream = CreateObject("ADODB.Stream")
        stream.Type = 1 ' Binary
        stream.Open
        stream.Write http.responseBody
        stream.SaveToFile savePath, 2 ' 2 means overwrite if the file exists
        stream.Close
    Else
        MsgBox "Error downloading file " & i & ": " & http.Status & " - " & http.statusText, vbCritical, "Download Error"
    End If
Next

' Show a message box indicating that the downloads are complete
MsgBox "Download completed 1000 times.", vbInformation, "Download Status"

' Clean up
Set http = Nothing
Set stream = Nothing
Set shell = Nothing