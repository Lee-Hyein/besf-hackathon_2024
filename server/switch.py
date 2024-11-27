import time
import struct
from libsbapi import SBAPIClient, CMDCODE, STATCODE

# 각 장치에 대한 OPID를 별도로 관리
opid = 1
client = SBAPIClient("ONcxHkHPnGhrp1MruIADUX3iLdy2juB3")

def getcommand(cmd):
    ctbl = {
        CMDCODE.OFF: "중지",
        CMDCODE.ON: "작동",
        CMDCODE.TIMED_OPEN: "시간열림",
        CMDCODE.TIMED_CLOSE: "시간닫음"
    }
    return ctbl[cmd] if cmd in ctbl else "없는 명령"

def sendcommand(cmd, idx, device, sec=None):
    global opid, client
    opid += 1
    reg = [cmd, opid]

    if sec is not None:
        reg.extend(struct.unpack('HH', struct.pack('i', sec)))

    print(f"{getcommand(cmd)} 명령을 전송합니다. OPID: {opid}, reg: {reg}")
    client.write_multiple_registers(500 + idx, reg, 4)
    time.sleep(1)  # 명령 전송 후 잠시 대기
    return readstatus(idx)  # 상태 확인

def getstatus(stat):
    ctbl = {
        STATCODE.READY: "중지된 상태",
        STATCODE.WORKING: "작동중",
        STATCODE.OPENING: "여는중",
        STATCODE.CLOSING: "닫는중"
    }
    return ctbl[stat] if stat in ctbl else "없는 상태"

def getremaintime(reg1, reg2):
    return struct.unpack('i', struct.pack('HH', reg1, reg2))[0]

def readstatus(idx, readtime=False):
    global opid, client
    reg = client.read_holding_registers(200 + idx, 4, 4)
    
    # 현재 레지스터의 OPID를 가져와서 동기화
    if reg and len(reg) > 0:
        opid = reg[0]  # 현재 레지스터의 OPID로 업데이트
        status = getstatus(reg[1])
        print(f"현재 OPID: {opid}, 상태: {status}")
        return status
    else:
        print("레지스터 읽기 실패")
        return None
