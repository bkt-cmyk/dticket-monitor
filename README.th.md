# D-Ticket monitor

เครื่องมือค้นหาข้อมูลเที่ยวรถและจำนวนที่ว่างระดับหมวดรถนอนสำหรับผู้โดยสารทั่วไปของ D-Ticket การรถไฟแห่งประเทศไทย ทำงานแบบอ่านข้อมูลเท่านั้น ไม่เข้าสู่ระบบ ไม่เลือกที่นั่ง ไม่จอง ไม่ชำระเงิน ไม่ส่งการแจ้งเตือน และไม่ตั้งเวลาทำงานเอง เว็บไซต์ต้นทางไม่มีเอกสาร API อย่างเป็นทางการและอาจเปลี่ยนแปลงได้

> **ความปลอดภัย:** ผลสแกน NVIDIA SkillSpector แบบ static ของ commit แรกให้ระดับ HIGH และแนะนำ DO NOT INSTALL โปรดตรวจสอบโค้ดและประเมินความเสี่ยงก่อนใช้ โดยเฉพาะการเรียก shell/network และ dependencies การสแกนไม่รับประกันความปลอดภัย

## ติดตั้งในเครื่อง

ต้องใช้ Python 3.9 ขึ้นไปและ `requests` เปิดเทอร์มินัลในโฟลเดอร์โปรเจกต์:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -v
```

บน Windows ใช้ `.venv\Scripts\python.exe` แทน `.venv/bin/python` ชุดทดสอบใช้ HTTP server ภายในเครื่อง ไม่ติดต่อเครือข่ายของการรถไฟ

การติดตั้งด้วย virtual environment แยก dependencies ออกจาก Python หลัก แต่ไม่ใช่ sandbox โปรแกรมยังทำงานด้วยสิทธิ์ของผู้ใช้ปัจจุบัน

## ค้นหารหัสสถานี

```sh
.venv/bin/python dticket_monitor.py --station 'เชียงใหม่' --json
```

โปรแกรมดาวน์โหลดรายชื่อสถานีจาก endpoint แบบอ่านข้อมูลของเว็บไซต์ D-Ticket แล้วค้นหาชื่อภาษาไทยหรืออังกฤษ ผล JSON แต่ละบรรทัดมี `station_id`, `station_no`, `name_th` และ `name_en` ให้ใช้ **`station_id`** ในการค้นหาเที่ยวรถ ไม่ใช่ `station_no` ตรวจชื่อให้ตรงหากมีหลายผลลัพธ์ที่คล้ายกัน

ไม่พบชื่อจะแสดงผลว่างและ exit 0 ส่วนการค้นหาล้มเหลวหรือข้อมูลผิดรูปแบบจะ exit 1 การพบสถานีไม่ได้รับประกันว่ามีเส้นทางที่ต้องการ

## ตรวจเที่ยวรถ

แทนค่าตัวอย่างด้วย station ID ที่ค้นพบและตรวจสอบแล้ว:

```sh
.venv/bin/python dticket_monitor.py \
  --origin ORIGIN_ID \
  --destination DESTINATION_ID \
  --date YYYY-MM-DD \
  --train TRAIN_NUMBER
```

- วันที่เป็นปี **ค.ศ.** ในรูปแบบ `YYYY-MM-DD`
- ระบุ `--date` และ `--train` ซ้ำได้เมื่อต้องการหลายวันหรือหลายขบวน
- หากไม่ระบุ `--train` จะตรวจทุกขบวนที่พบ ซึ่งอาจส่งคำขอจำนวนมาก
- เพิ่ม `--json` เพื่อรับผล JSON Lines
- `--timeout 25` กำหนด timeout ของการเชื่อมต่อและการอ่านแต่ละ HTTP request ไม่ใช่เวลารวมสูงสุดของทั้งงาน

### การอ่านผล

`category_available_count` คือจำนวนที่ระบบต้นทางรายงานสำหรับหมวดโดยสาร **ไม่ใช่การยืนยันว่าเตียงบนหรือเตียงล่างว่าง** และไม่รับประกันว่าจะจองได้ ราคาที่แสดงก็ไม่ได้ยืนยันว่าเตียงประเภทนั้นว่าง โปรแกรมไม่อนุมานว่าปุ่มเลือกใช้ได้หรือมี waiting list

หากไม่พบหมวด ไม่พบขบวนที่ระบุ ข้อมูลผิดรูปแบบ หรือ request ล้มเหลว ให้ถือว่าผล **ไม่ทราบ/ตรวจสอบไม่ได้** ไม่ใช่หลักฐานว่าตั๋วเต็ม หากผลเที่ยวรถว่างและไม่ได้ระบุขบวน โปรแกรมจะแสดงรายการขบวนว่าง ไม่สรุปว่าตั๋วเต็ม

โปรแกรมตรวจวันหรือขบวนอื่นต่อเมื่อบางรายการล้มเหลว แต่หากเริ่ม session ไม่สำเร็จจะหยุดทำงาน Exit status: `0` ตรวจครบโดยไม่พบข้อผิดพลาด, `1` มีรายการตรวจไม่สำเร็จ, `2` อาร์กิวเมนต์ไม่ถูกต้อง ผลลัพธ์และ log อาจมีเส้นทางกับวันเดินทาง จึงควรจัดเก็บอย่างระมัดระวัง

## ติดตั้ง Hermes Skill (ทางเลือก)

ตัวโปรแกรม Python ยังคงอยู่ในโฟลเดอร์โปรเจกต์ ส่วน Skill เป็นเพียงคำแนะนำให้ Hermes เรียกใช้โปรแกรม ติดตั้งโปรเจกต์ตามขั้นตอนข้างต้นก่อน คำสั่งต่อไปนี้คัดลอกเฉพาะ `SKILL.md` ไปยัง Hermes home ที่เลือก ไม่ติดตั้ง dependencies ใน Hermes ไม่เปลี่ยน configuration ไม่สร้าง cron และไม่ส่งข้อความ ตรวจสอบปลายทางและขออนุมัติก่อนรัน จากโฟลเดอร์โปรเจกต์บน POSIX shell:

```sh
HERMES_SKILL_HOME="${HERMES_HOME:-$HOME/.hermes}"
test ! -e "$HERMES_SKILL_HOME/skills/dticket-monitor" || { printf '%s\n' 'มีปลายทางนี้อยู่แล้ว ให้หยุดและตรวจสอบก่อน'; exit 1; }
mkdir -p "$HERMES_SKILL_HOME/skills/dticket-monitor"
cp SKILL.md "$HERMES_SKILL_HOME/skills/dticket-monitor/SKILL.md"
```

เริ่ม Hermes session ใหม่ แล้วขอให้ใช้ Skill `dticket-monitor` โดยบอก path แบบเต็มของโฟลเดอร์โปรเจกต์ ดู [คู่มือ Skill ของ Hermes](https://hermes-agent.nousresearch.com/docs/guides/work-with-skills) หากต้องการถอน Skill ให้ตรวจสอบ path แล้วลบเฉพาะโฟลเดอร์ Skill ที่คัดลอกไป บน Windows ให้คัดลอก `SKILL.md` ไปยัง `skills/dticket-monitor` ภายใต้ Hermes home ที่ใช้งาน และใช้ interpreter ของ Windows venv

## ตั้งเวลาทำงานอย่างระมัดระวัง

ทดลองรันด้วยมือก่อน และตรวจสอบว่าบริการต้นทางอนุญาตความถี่ที่ต้องการ ควรกำหนดความถี่พอเหมาะ ป้องกันงานรันซ้อน คำนึงถึง timezone และจำนวน request จำกัดระยะเวลารัน ปกป้อง log และตรวจสอบ exit status ที่ไม่ใช่ศูนย์ ขออนุมัติแยกก่อนสร้างหรือแก้ cron, timer หรือการแจ้งเตือน โปรเจกต์นี้ไม่ตั้งค่าเหล่านี้เอง และไม่มีระบบ retry หรือ notification ในตัว

### ตัวอย่าง Hermes no-agent (ยังไม่ได้ติดตั้งโดยโปรเจกต์)

ตัวอย่างต่อไปนี้เป็นเพียงแนวทาง ไม่ใช่งานที่ถูกสร้างแล้ว ใช้ผลลัพธ์ภายในเครื่องเท่านั้น ใน Hermes สคริปต์ต้องอยู่ภายใต้ `$HERMES_HOME/scripts` ของ profile ที่ใช้งาน และค่า script เป็นชื่อไฟล์ ไม่ใช่ command line โดย wrapper สามารถเรียก Python ใน venv ของโปรเจกต์ด้วย path แบบเต็มได้ แทนที่ placeholder ทั้งหมด วันที่ในตัวอย่างเป็นวันที่คงที่จนกว่าจะแก้ wrapper

หลังได้รับอนุมัติแยก ให้สร้าง `$HERMES_HOME/scripts/dticket-check.sh` (หากไม่ได้ตั้ง `HERMES_HOME` ให้ใช้ `~/.hermes`):

```bash
#!/bin/bash
exec /ABSOLUTE/PATH/TO/dticket-monitor/.venv/bin/python /ABSOLUTE/PATH/TO/dticket-monitor/dticket_monitor.py --origin ORIGIN_ID --destination DESTINATION_ID --date YYYY-MM-DD --train TRAIN_NUMBER --json --timeout 15
```

ตั้ง `HERMES_HOME` ให้ตรง profile แล้วทดลอง wrapper ด้วยมือ:

```sh
bash "$HERMES_HOME/scripts/dticket-check.sh"
```

ตรวจผลและ exit status ก่อน จากนั้นหากได้รับอนุมัติแยก สามารถสร้างงานแบบพักไว้และเก็บผลเฉพาะในเครื่อง โดยใช้ Hermes เวอร์ชันที่รองรับ flags เหล่านี้:

```sh
hermes cron create 'every 6h' --no-agent --script dticket-check.sh --deliver local --name dticket-check --paused
hermes cron list
hermes cron status
```

ตรวจงานและสถานะ scheduler ก่อนขออนุมัติแยกเพื่อ `hermes cron resume dticket-check` gateway ที่กำลังทำงานจะขับเคลื่อน scheduler ดู [คู่มือ Hermes cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) สำหรับตัวเลือกและพฤติกรรมตามเวอร์ชัน no-agent ส่ง stdout ไปยังปลายทางที่ตั้งไว้และใช้ nonzero exit เป็น failure; ผลสำเร็จบางรายการอาจปรากฏร่วมกับข้อผิดพลาดได้ timeout ของสคริปต์กับของแต่ละ request ไม่เท่ากัน จึงควรจำกัดจำนวนวัน/ขบวนและตรวจ timeout กับพฤติกรรมรันซ้อนของ scheduler

ตัวอย่างนี้ยังไม่ได้ทดสอบการตั้งเวลาและการส่งแจ้งเตือนแบบครบวงจร อย่าเลือกปลายทางส่งข้อความโดยไม่มีการอนุมัติแยก

## ใบอนุญาต

[MIT License](LICENSE)
