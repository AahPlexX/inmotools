# Typing Workstation third-party data notice

## English frequency-ranked practice corpus

`typing-english-frequency.ts` is an adapted data subset of **FrequencyWords** by Hermit Dave, using `content/2018/en/en_50k.txt` pinned at commit 525f9b560de45753a5ea01069454e72e9aa541c6. FrequencyWords states that its generated content is licensed under **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)** and derives its 2018 frequency lists from the OpenSubtitles 2018 corpus.

Source: https://github.com/hermitdave/FrequencyWords

License: https://creativecommons.org/licenses/by-sa/4.0/

Transformation used here: preserve the source frequency order, lowercase tokens, retain ASCII alphabetic tokens, remove duplicates, then take the first 5,000 accepted entries. The derived data file is redistributed under CC BY-SA 4.0. The surrounding InMo Tools code remains under its repository license.
