-- DISTANCE // ZERO: the one icon. Runs studio/launch.js (OBS, studio, Director Studio, checks) and shows READY or what to do.
-- Built into "DISTANCE ZERO.app" by launcher/make-app.sh. Nothing here streams, records or switches scenes.
on run
	display notification "Opening OBS and the studio…" with title "DISTANCE // ZERO"
	set studioDir to "__STUDIO__"
	try
		set r to do shell script "export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; cd " & quoted form of studioDir & " && node launch.js 2>&1"
	on error e
		set r to "CHECK" & return & "• The launcher could not run: " & e
	end try
	set p to paragraphs of r
	set AppleScript's text item delimiters to return
	set body to (items 2 thru -1 of p) as text
	set AppleScript's text item delimiters to ""
	if item 1 of p is "READY" then
		display dialog "READY" & return & return & body with title "DISTANCE // ZERO" buttons {"OK"} default button 1 giving up after 30
	else
		display dialog "CHECK — something needs attention" & return & return & body with title "DISTANCE // ZERO" buttons {"OK"} default button 1 with icon caution
	end if
end run
