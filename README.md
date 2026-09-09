# lotto-data

한국 로또 6/45 당첨 데이터셋. 1회차(2002-12-07)부터 최신 회차까지, 당첨 번호와 등수별 당첨금·당첨자 수·판매액 등 회차 상세를 포함한다.

## Usage

Raw URL:
```
https://raw.githubusercontent.com/jeong760/lotto-data/main/data/lotto-history.json
```

```javascript
const response = await fetch(
  'https://raw.githubusercontent.com/jeong760/lotto-data/main/data/lotto-history.json'
);
const { data, latestRound, updatedAt } = await response.json();
```

## Format

```json
{
  "updatedAt": "2026-06-27T13:00:00.000Z",
  "latestRound": 1230,
  "data": [
    {
      "drawNo": 1230,
      "date": "2026-06-27",
      "numbers": [3, 8, 9, 22, 28, 42],
      "bonusNo": 45,
      "prizes": [
        { "rank": 1, "winners": 16, "prizePerWinner": 1771357196 },
        { "rank": 2, "winners": 90, "prizePerWinner": 52484658 },
        { "rank": 3, "winners": 3336, "prizePerWinner": 1415953 },
        { "rank": 4, "winners": 168902, "prizePerWinner": 50000 },
        { "rank": 5, "winners": 2770957, "prizePerWinner": 5000 }
      ],
      "totalWinners": 2943301,
      "totalPrize": 60088838564,
      "totalSales": 120177677000,
      "firstWinMethod": { "auto": 15, "manual": 1, "semiAuto": 0 }
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `drawNo` | number | 회차 번호 |
| `date` | string | 추첨일 (ISO 8601, YYYY-MM-DD) |
| `numbers` | number[] | 당첨 번호 6개 (오름차순) |
| `bonusNo` | number | 보너스 번호 |
| `prizes` | object[] | 1~5등 당첨 정보 (아래 표) |
| `totalWinners` | number | 총 당첨자 수 (전 등수 합) |
| `totalPrize` | number | 총 당첨금액 (원, 등수별 당첨금 합) |
| `totalSales` | number | 총 판매액 (원) |
| `firstWinMethod` | object | 1등 게임 유형별 수 (아래 표) |

`prizes[]` 항목:

| Field | Type | Description |
|-------|------|-------------|
| `rank` | number | 등수 (1~5) |
| `winners` | number | 해당 등수 당첨자 수 (없으면 0) |
| `prizePerWinner` | number | 1인당 당첨금 (원) |

`firstWinMethod`:

| Field | Type | Description |
|-------|------|-------------|
| `auto` | number | 자동 |
| `manual` | number | 수동 |
| `semiAuto` | number | 반자동 |

`prizes` 이하 필드는 옵셔널이다. 원천이 상세를 제공하지 않는 초기 일부 회차에는 없을 수 있으며, 특히 `firstWinMethod`는 262회차부터 제공된다. 소비 측은 이들 필드를 `undefined` 가능으로 다뤄야 한다.

## Update Schedule

매주 토요일 22:00 KST(13:00 UTC)에 GitHub Actions로 자동 갱신된다. 누락 회차만 증분 크롤링 후 변경 시 자동 커밋·푸시.

## Source

초기 데이터는 [smok95/lotto](https://github.com/smok95/lotto)에서 부트스트랩했고, 이후 회차는 동행복권(dhlottery.co.kr) 사이트를 Playwright로 크롤링해 갱신한다.

설계 결정의 배경은 [DECISIONS.md](DECISIONS.md) 참고.

## License

MIT — 전문은 [LICENSE](LICENSE) 참고.

데이터 자체는 동행복권이 공개한 추첨 결과를 정리한 것이다.
