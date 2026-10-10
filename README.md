# 리드시트 데모 — 음원을 코드표와 멜로디 오선보로

유튜브 링크나 음원 파일을 넣으면 **박자·마디·코드·조성·보컬 멜로디**를 분석해서, 폰에서 바로 보는 **코드표와 리드시트(멜로디+코드 오선보)**를 만들어 주는 개인 프로젝트의 공개 데모입니다.

**데모 보기:** https://jin123-mye.github.io/leadsheet/

- 데모 곡 3개는 저작권 보호기간이 끝난 **유명 곡(공유저작물)**을 직접 합성해 연주한 것입니다. 곡은 공유저작물이고 연주·녹음·코드 반주는 새로 만든 것이라 음원 권리 문제도 없습니다(가사는 쓰지 않음). 화면은 분석 엔진이 낸 결과 그대로입니다.
- 실제 분석(업로드·유튜브 입력)은 개인 서버(맥)에서만 돌고, 이 저장소에는 데모 화면만 공개합니다.

| 곡 목록 | 코드표 | 오선보 |
|---|---|---|
| <img src="docs/screenshots/home.jpg" width="240"> | <img src="docs/screenshots/chords.jpg" width="240"> | <img src="docs/screenshots/staff.jpg" width="240"> |

## 데모에서 해볼 수 있는 것
- **코드표 / 오선보** 전환, 재생하면 현재 박·음표 강조와 자동 스크롤, 마디·음표를 눌러 그 위치로 이동
- **조옮김**(음표·조표·코드 함께), **카포**(쉬운 모양 추천), 간단히/자세히(7th·sus·슬래시), 도수(I·IV·V)
- **조바꿈** — '환희의 송가' 2절이 D장조 → E♭장조로 올라가면서 조표·♯/♭ 표기가 바뀜 / **3/4박자·못갖춘마디** — '그린슬리브스'
- 코드 고치기, 원곡/반주만, 재생 속도 0.85/0.7×, 받아적은 멜로디를 합성음으로 같이 듣기
- 데모에서 바꾼 설정은 이 브라우저에만 저장됩니다

## 분석 엔진 (비공개 부분)
```
음원 → Demucs 악기 분리 → beat_this 박·다운비트 → 박 단위 보정(곡 중간 2배속 구간)
     → BTC 코드 확률(170종) → 마디 Viterbi(박자 3/4·4/4 × 박 위치, 근거 = 다운비트 + 코드 변화)
     → 박 단위 코드 Viterbi + 베이스로 슬래시 코드 → 구간별 조성 Viterbi(조바꿈)
     → 보컬 torchcrepe 음높이 → 16분음표 격자 양자화·정리 → 웹(코드표 HTML / 오선보 ABC → abcjs)
```
Python(PyTorch, FastAPI) 서버 + 빌드 없는 바닐라 JS 웹앱. 맥에서 4분 곡을 약 1분에 분석합니다.

## 데모곡 정확도 (정답 악보와 비교)
| 곡 | 코드(근음) | 조성 | 마디 박자표 | 멜로디(음 시작+높이 F) |
|---|---|---|---|---|
| 반짝반짝 작은 별 (18세기 프랑스 민요, C장조 4/4) | 100% | 100% | 100% | 0.97 |
| 환희의 송가 (베토벤 교향곡 9번 주제, D장조 → E♭장조 4/4) | 99.6% | 100% | 100% | 0.95 |
| 그린슬리브스 (16세기 잉글랜드 민요, A단조 3/4) | 100% | 100% | 91% | 0.96 |

- 그린슬리브스는 후렴 일부에서 마디 첫 박을 한 박 어긋나게 잡아 5박 마디가 몇 개 생깁니다(3/4 마디 91% 일치).
- 합성 목소리는 Demucs가 보컬로 분리하지 못해서, 데모의 멜로디는 멜로디 트랙을 같은 엔진으로 받아적었고 '반주만'은 합성 때 만든 반주 트랙입니다. 실제 녹음은 Demucs 보컬 트랙에서 받아적습니다.

## 사용한 오픈소스
화면: [abcjs](https://github.com/paulrosen/abcjs) (MIT, `docs/vendor`에 포함)
엔진: [Demucs](https://github.com/facebookresearch/demucs) (MIT) · [beat_this](https://github.com/CPJKU/beat_this) (MIT) · [BTC-ISMIR19](https://github.com/jayg996/BTC-ISMIR19) (MIT) · [torchcrepe](https://github.com/maxrmorrison/torchcrepe) (MIT) · [librosa](https://github.com/librosa/librosa) (ISC) · [PyTorch](https://pytorch.org) (BSD-3) · [FastAPI](https://github.com/fastapi/fastapi) (MIT)
